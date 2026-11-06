import Foundation
import Observation

@MainActor @Observable public final class ConversationStore {
    public private(set) var summary: SessionSummary
    public private(set) var messages: [ChatMessage] = []
    public var draft = ""
    public private(set) var sending = false
    public private(set) var errorKey: String?
    public private(set) var hasMore = false
    public private(set) var pending: PendingMessage?
    public private(set) var modelCatalog: SessionModelCatalog?
    public private(set) var currentModel: ModelRoute?
    public private(set) var loadingModels = false
    public private(set) var switchingModel = false
    public private(set) var modelErrorKey: String?
    private var cursor: Int?
    private let client: MobileAPI
    private let outbox: PendingMessages
    private var restored = false
    private var refreshing = false
    private var modelsRestored = false
    private var modelRevision = 0
    public var canSend: Bool { restored && pending == nil && !sending }
    public var currentModelName: String {
        modelCatalog?.displayName(for: currentModel) ?? currentModel?.model ?? ""
    }

    public init(session: SessionSummary, client: MobileAPI, outbox: PendingMessages = PendingMessages()) {
        summary = session
        currentModel = session.modelRoute
        self.client = client
        self.outbox = outbox
    }

    public func refresh(older: Bool = false) async {
        guard !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        let revision = modelRevision
        do {
            if !restored {
                pending = try await outbox.load(origin: client.endpoint.absoluteString, sessionId: summary.id)
                restored = true
            }
            let value = try await client.conversation(summary.id, before: older ? cursor : nil)
            guard !Task.isCancelled else { return }
            let selected = revision == modelRevision ? value.session.modelRoute : currentModel
            summary = value.session.selecting(selected)
            currentModel = selected
            if older {
                let ids = Set(messages.map(\.id))
                messages = value.messages.filter { !ids.contains($0.id) } + messages
            } else {
                let newest = Set(value.messages.map(\.id))
                let earlier = messages.filter { !newest.contains($0.id) && $0.createdAt < (value.messages.first?.createdAt ?? .distantPast) }
                let combined = earlier + value.messages
                if combined != messages { messages = combined }
            }
            if older || cursor == nil || messages.first?.id == value.messages.first?.id {
                hasMore = value.hasMore; cursor = value.cursor
            }
            if let pending, value.messages.contains(where: { $0.requestId == pending.requestId }) {
                try await outbox.remove(origin: client.endpoint.absoluteString, sessionId: summary.id)
                self.pending = nil
                if draft.trimmingCharacters(in: .whitespacesAndNewlines) == pending.text { draft = "" }
            }
            errorKey = nil
        } catch { if !Task.isCancelled { errorKey = (error as? CompanionError)?.localizationKey ?? "error.unavailable" } }
    }

    public func loadModels() async {
        guard !modelsRestored, !loadingModels else { return }
        loadingModels = true
        modelErrorKey = nil
        defer { loadingModels = false }
        let revision = modelRevision
        do {
            let catalog = try await client.models(for: summary.id)
            guard !Task.isCancelled, revision == modelRevision else { return }
            modelCatalog = catalog
            modelsRestored = true
            if let selected = catalog.current {
                currentModel = selected
                summary = summary.selecting(selected)
            }
        } catch {
            if !Task.isCancelled {
                modelErrorKey = (error as? CompanionError)?.localizationKey ?? "error.unavailable"
            }
        }
    }

    public func switchModel(provider: String, model: String) async {
        let requested = ModelRoute(provider: provider, model: model)
        guard !switchingModel, requested.provider != currentModel?.provider || requested.model != currentModel?.model else { return }
        modelRevision += 1
        let revision = modelRevision
        switchingModel = true
        modelErrorKey = nil
        defer { if revision == modelRevision { switchingModel = false } }
        do {
            let selected = try await client.selectModel(requested, in: summary.id)
            guard !Task.isCancelled, revision == modelRevision else { return }
            currentModel = selected
            summary = summary.selecting(selected)
            modelCatalog = modelCatalog?.selecting(selected)
        } catch {
            if !Task.isCancelled {
                modelErrorKey = "chat.model.switch_failed"
            }
        }
    }

    public func send(retry: Bool = false) async {
        guard restored, !sending, retry || pending == nil else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard retry && pending != nil || !text.isEmpty && text.utf16.count <= 4000 else { return }
        sending = true
        defer { sending = false }
        do {
            let message = retry ? pending! : PendingMessage(sessionId: summary.id, text: text)
            try await outbox.save(message, origin: client.endpoint.absoluteString)
            pending = message
            try await client.send(message.text, to: summary.id, requestId: message.requestId)
            try await outbox.remove(origin: client.endpoint.absoluteString, sessionId: summary.id)
            pending = nil
            if draft.trimmingCharacters(in: .whitespacesAndNewlines) == message.text { draft = "" }
            await refresh()
        } catch { if !Task.isCancelled { errorKey = (error as? CompanionError)?.localizationKey ?? "chat.delivery_unknown" } }
    }
}
