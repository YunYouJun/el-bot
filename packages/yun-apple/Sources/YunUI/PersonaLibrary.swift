import Foundation
import Observation
import SwiftUI
import YunCore

private extension ToolbarItemPlacement {
    static var personaLibraryTrailing: Self {
        #if os(iOS)
        .topBarTrailing
        #else
        .automatic
        #endif
    }
}

@MainActor @Observable final class PersonaLibraryStore {
    private(set) var response: PersonaResponse?
    private(set) var preview: PersonaPreview?
    private(set) var busy = false
    private(set) var errorKey: String?
    private(set) var noticeKey: String?
    @ObservationIgnored private let api: MobileAPI
    @ObservationIgnored private let onUnauthorized: (Error) -> Void

    init(api: MobileAPI, onUnauthorized: @escaping (Error) -> Void) {
        self.api = api
        self.onUnauthorized = onUnauthorized
    }

    func clearFeedback() {
        errorKey = nil
        noticeKey = nil
    }

    @discardableResult func perform(_ request: PersonaRequest) async -> Bool {
        guard !busy else { return false }
        busy = true
        errorKey = nil
        noticeKey = nil
        defer { busy = false }
        do {
            let result = try await api.personas(request)
            try Task.checkCancellation()
            response = result
            if let value = result.preview { preview = value }
            if request.operation == .use || request.operation == .disable { noticeKey = "persona.saved" }
            if request.operation == .import || request.operation == .update { noticeKey = "persona.imported" }
            return true
        } catch {
            guard !Task.isCancelled else { return false }
            report(error, fallback: "error.unavailable")
            if error as? CompanionError == .unauthorized { onUnauthorized(error) }
            return false
        }
    }

    func report(_ error: Error, fallback: String = "persona.error.file") {
        noticeKey = nil
        if case let CompanionError.rejected(code) = error {
            switch code {
            case "personas_not_configured", "not_found": errorKey = "persona.error.unavailable"
            case "persona_too_large", "request_too_large": errorKey = "persona.error.size"
            case "invalid_persona_file": errorKey = "persona.error.file"
            case "invalid_persona_request": errorKey = "persona.error.input"
            case "persona_operation_failed": errorKey = "persona.error.operation"
            default: errorKey = "error.rejected"
            }
        } else {
            errorKey = (error as? CompanionError)?.localizationKey ?? fallback
        }
    }
}

/// Native persona management shared by the iPhone, iPad and Mac shells.
public struct PersonaLibraryScreen: View {
    let chat: ChatStore
    @Environment(\.yunStrings) private var text

    public init(chat: ChatStore) {
        self.chat = chat
    }

    public var body: some View {
        Group {
            if let api = chat.client, let device = chat.device {
                PersonaLibraryView(api: api) { error in
                    if chat.client === api { chat.handle(error) }
                }
                .id(device.id)
            } else {
                ChatConnectionView(store: chat)
            }
        }
        .navigationTitle(text["personas"])
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}

private struct PersonaLibraryView: View {
    @State private var model: PersonaLibraryStore
    @State private var sheet: ImportSheet?
    @State private var importedID: String?
    @Environment(\.yunStrings) private var text
    @Environment(\.scenePhase) private var scenePhase
    private enum ImportSheet: String, Identifiable { case card; var id: String { rawValue } }

    init(api: MobileAPI, onUnauthorized: @escaping (Error) -> Void) {
        _model = State(initialValue: PersonaLibraryStore(api: api, onUnauthorized: onUnauthorized))
    }

    var body: some View {
        List {
            if let library = model.response?.library {
                Section {
                    HStack(alignment: .top, spacing: 14) {
                        PersonaAvatar(personaID: library.active?.id, size: 64)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(library.activeRevision?.metadata.name ?? text["persona.default"]).font(.headline)
                            if let detail = library.activeRevision?.metadata.description {
                                Text(detail).foregroundStyle(.secondary)
                            }
                            Text(model.response?.instance.title ?? "").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if library.active != nil {
                        Button(text["persona.restoreDefault"]) {
                            Task { await model.perform(PersonaRequest(.disable)) }
                        }
                        .disabled(model.busy)
                    }
                } header: {
                    Text(text["currentPersona"])
                } footer: {
                    Text(text["persona.scope"])
                }
                Section(text["persona.library"]) {
                    if library.cards.isEmpty {
                        ContentUnavailableView(
                            text["persona.empty"],
                            systemImage: "person.crop.rectangle",
                            description: Text(text["persona.empty.detail"])
                        )
                    }
                    ForEach(library.cards) { card in
                        NavigationLink {
                            PersonaDetailView(model: model, cardID: card.id)
                        } label: {
                            HStack(spacing: 12) {
                                PersonaAvatar(personaID: card.id)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(card.metadata.name)
                                    if let detail = card.metadata.description {
                                        Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                    }
                                }
                                Spacer()
                                if library.active?.id == card.id {
                                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.tint)
                                        .accessibilityLabel(text["persona.enabled"])
                                }
                            }
                        }
                        .disabled(model.busy)
                        .accessibilityIdentifier("personaCard-" + card.id)
                        .contextMenu {
                            Button(text["persona.enableLatest"]) {
                                Task { await model.perform(PersonaRequest(.use, id: card.id, revision: card.hash)) }
                            }
                            .disabled(model.busy)
                        }
                    }
                }
            } else if !model.busy {
                ContentUnavailableView(
                    text["personas"],
                    systemImage: "person.crop.rectangle",
                    description: Text(text["persona.empty.detail"])
                )
            }
            PersonaFeedback(model: model)
        }
        .overlay { if model.busy && model.response == nil { ProgressView() } }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { model.clearFeedback(); sheet = .card } label: {
                    Label(text["persona.import"], systemImage: "plus")
                }
                .disabled(model.busy || model.response == nil)
                .accessibilityIdentifier("personaImport")
            }
            ToolbarItem(placement: .personaLibraryTrailing) {
                Button { Task { await model.perform(PersonaRequest(.list)) } } label: {
                    Label(text["refresh"], systemImage: "arrow.clockwise")
                }
                .disabled(model.busy)
            }
        }
        .refreshable { await model.perform(PersonaRequest(.list)) }
        .task(id: scenePhase) {
            if scenePhase == .active { await model.perform(PersonaRequest(.list)) }
        }
        .sheet(item: $sheet) { _ in
            PersonaImportView(model: model) { id in importedID = id }
        }
        .navigationDestination(item: $importedID) { id in
            PersonaDetailView(model: model, cardID: id)
        }
    }
}

private struct PersonaDetailView: View {
    let model: PersonaLibraryStore
    let cardID: String
    @Environment(\.yunStrings) private var text
    private var card: PersonaCard? { model.response?.library.cards.first { $0.id == cardID } }
    private var preview: PersonaPreview? { model.preview.flatMap { $0.metadata.id == cardID ? $0 : nil } }
    private var enabled: Bool {
        guard let preview, let active = model.response?.library.active else { return false }
        return active.id == cardID && active.hash == preview.hash
    }

    var body: some View {
        List {
            if let preview {
                Section {
                    HStack(alignment: .top, spacing: 16) {
                        PersonaAvatar(personaID: preview.metadata.id, size: 80)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(preview.metadata.name).font(.title2.bold())
                            if let detail = preview.metadata.description { Text(detail) }
                        }
                    }
                    Button(text[enabled ? "persona.enabled" : "persona.enable"]) {
                        Task { await model.perform(PersonaRequest(.use, id: cardID, revision: preview.hash)) }
                    }
                    .disabled(model.busy || enabled)
                    .accessibilityIdentifier("personaEnable")
                } footer: {
                    Text(text["persona.scope"])
                }
                Section(text["persona.version"]) {
                    Picker(text["persona.version"], selection: Binding(get: { preview.hash }, set: { hash in
                        Task { await model.perform(PersonaRequest(.preview, id: cardID, revision: hash)) }
                    })) {
                        ForEach(card?.revisions ?? []) { revision in
                            Text(revisionLabel(revision)).tag(revision.hash)
                        }
                    }
                    .disabled(model.busy)
                    .accessibilityIdentifier("personaRevision")
                    if card?.source.canCheckUpdates == true {
                        Button(text["persona.checkUpdates"]) {
                            Task { await model.perform(PersonaRequest(.update, id: cardID)) }
                        }
                        .disabled(model.busy)
                    }
                }
                Section(text["persona.source"]) {
                    if let author = preview.metadata.author { LabeledContent(text["persona.author"], value: author) }
                    if let license = preview.metadata.license { LabeledContent(text["persona.license"], value: license) }
                    Text(preview.source.summary).font(.footnote).textSelection(.enabled)
                }
                Section(text["persona.content"]) {
                    PersonaContentView(markdown: preview.body).id(preview.hash)
                }
            }
            PersonaFeedback(model: model)
        }
        .navigationTitle(card?.metadata.name ?? text["personas"])
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .task(id: cardID) {
            if preview == nil { await model.perform(PersonaRequest(.preview, id: cardID)) }
        }
        .refreshable {
            await model.perform(PersonaRequest(.preview, id: cardID, revision: preview?.hash))
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await model.perform(PersonaRequest(.preview, id: cardID, revision: preview?.hash)) }
                } label: {
                    Label(text["refresh"], systemImage: "arrow.clockwise")
                }
                .disabled(model.busy)
            }
            ToolbarItem(placement: .personaLibraryTrailing) {
                if model.busy { ProgressView() }
            }
        }
    }

    private func revisionLabel(_ revision: PersonaRevision) -> String {
        let date = revision.importedAt.formatted(
            Date.FormatStyle(date: .abbreviated, time: .shortened)
                .locale(Locale(identifier: text.locale))
        )
        return "\(revision.metadata.version ?? date) · \(revision.hash.prefix(8))"
    }
}

struct PersonaFeedback: View {
    let model: PersonaLibraryStore
    @Environment(\.yunStrings) private var text

    var body: some View {
        if let error = model.errorKey {
            Section { Label(text[error], systemImage: "exclamationmark.circle").foregroundStyle(.red) }
        }
        if let notice = model.noticeKey {
            Section { Label(text[notice], systemImage: "checkmark.circle").foregroundStyle(.secondary) }
        }
    }
}
