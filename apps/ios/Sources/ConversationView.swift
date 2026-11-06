import Observation
import SwiftUI
import YunBotCore

@MainActor
@Observable
final class ConversationModel {
    var summary: SessionSummary
    var messages: [ChatMessage] = []
    var draft = ""
    var sending = false
    var errorKey: String?
    var hasMore = false
    private var cursor: Int?
    private var pending: (text: String, id: String)?
    private let client: MobileAPI

    init(session: SessionSummary, client: MobileAPI) {
        summary = session
        self.client = client
    }

    func refresh(older: Bool = false) async {
        do {
            let value = try await client.conversation(summary.id, before: older ? cursor : nil)
            summary = value.session
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
                hasMore = value.hasMore
                cursor = value.cursor
            }
            errorKey = nil
        } catch {
            if !Task.isCancelled { errorKey = (error as? CompanionError)?.localizationKey ?? "error.unavailable" }
        }
    }

    func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sending, !text.isEmpty, text.utf16.count <= 4000 else { return }
        sending = true
        defer { sending = false }
        let requestId = pending?.text == text ? pending!.id : UUID().uuidString
        pending = (text, requestId)
        do {
            try await client.send(text, to: summary.id, requestId: requestId)
            if draft.trimmingCharacters(in: .whitespacesAndNewlines) == text { draft = "" }
            pending = nil
            await refresh()
        } catch {
            if !Task.isCancelled { errorKey = (error as? CompanionError)?.localizationKey ?? "error.unavailable" }
        }
    }
}

struct ConversationView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: ConversationModel

    init(session: SessionSummary, client: MobileAPI) {
        _model = State(initialValue: ConversationModel(session: session, client: client))
    }

    var body: some View {
        ScrollViewReader { reader in
            ScrollView {
                LazyVStack(spacing: 20) {
                    if model.hasMore { Button("chat.older") { Task { await model.refresh(older: true) } }.padding(.top) }
                    if model.messages.isEmpty && !model.summary.running {
                        ContentUnavailableView("chat.empty", systemImage: "bubble.left", description: Text("chat.empty.detail"))
                    }
                    ForEach(model.messages) { message in
                        MessageBubble(message: message).equatable().id(message.id)
                    }
                    if model.summary.running {
                        HStack(spacing: 10) { ProgressView(); Text("chat.thinking").font(.footnote).foregroundStyle(.secondary); Spacer() }
                    }
                    if let error = model.errorKey {
                        Label(LocalizedStringKey(error), systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.secondary)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }.padding()
            }
            .onChange(of: model.messages.last?.id) { _, _ in
                withAnimation(.easeOut(duration: 0.2)) { reader.scrollTo("bottom", anchor: .bottom) }
            }
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(model.summary.title)
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                if let modelName = model.summary.model { Text(modelName).font(.caption2).foregroundStyle(.secondary) }
                HStack(alignment: .bottom, spacing: 10) {
                    TextField("chat.placeholder", text: $model.draft, axis: .vertical)
                        .lineLimit(1...6).padding(12)
                        .background(.background, in: RoundedRectangle(cornerRadius: 18))
                        .accessibilityIdentifier("messageInput")
                    Button { Task { await model.send() } } label: {
                        if model.sending { ProgressView().tint(.white).frame(width: 20, height: 20) }
                        else { Image(systemName: "arrow.up").fontWeight(.semibold).frame(width: 20, height: 20) }
                    }
                    .buttonStyle(.borderedProminent).buttonBorderShape(.circle)
                    .disabled(model.sending || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.draft.utf16.count > 4000)
                    .accessibilityLabel(model.summary.running ? "chat.queue" : "chat.send")
                    .accessibilityIdentifier("sendMessage")
                }
                if model.draft.utf16.count > 4000 { Text("chat.too_long").font(.caption).foregroundStyle(.red) }
            }.padding(.horizontal).padding(.vertical, 10).background(.bar)
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await model.refresh()
                try? await Task.sleep(for: .seconds(model.summary.running ? 2 : 5))
            }
        }
    }
}

private struct MessageBubble: View, Equatable {
    let message: ChatMessage
    private var user: Bool { message.role == "user" }

    var body: some View {
        HStack(alignment: .top) {
            if user { Spacer(minLength: 36) }
            VStack(alignment: .leading, spacing: 7) {
                if !user { Label("app.name", systemImage: "cloud.fill").font(.caption.weight(.medium)).foregroundStyle(.secondary) }
                Text((try? AttributedString(markdown: message.text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(message.text)).textSelection(.enabled)
                    .font(.body).frame(maxWidth: .infinity, alignment: .leading)
                Text(message.createdAt, style: .time).font(.caption2).foregroundStyle(.secondary)
            }
            .padding(14)
            .background(user ? Color.accentColor.opacity(0.12) : Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
            if !user { Spacer(minLength: 24) }
        }
    }
}
