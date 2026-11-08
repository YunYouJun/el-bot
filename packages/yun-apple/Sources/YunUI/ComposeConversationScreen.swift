import SwiftUI
import YunCore

public struct ComposeConversationScreen: View {
    let store: ChatStore
    let onCreated: (String) -> Void
    @Environment(\.yunStrings) private var text
    @SceneStorage("yun.chat.compose.draft") private var draft = ""
    @State private var sending = false
    @State private var errorKey: String?
    @FocusState private var focused: Bool

    public init(store: ChatStore, onCreated: @escaping (String) -> Void) {
        self.store = store
        self.onCreated = onCreated
    }

    public var body: some View {
        ScrollView {
            ContentUnavailableView(
                text["chat.empty"],
                systemImage: "square.and.pencil",
                description: Text(text["chat.new.detail"])
            )
            .frame(maxWidth: .infinity, minHeight: 320)
        }
        .navigationTitle(text["sessions.new"])
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .modifier(ConversationInputBar { composer })
        .task { focused = true }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom, spacing: 12) {
                TextField(text["chat.placeholder"], text: $draft, axis: .vertical)
                    .font(.body)
                    .lineLimit(1...6)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                    .frame(minHeight: 50)
                    .modifier(ConversationFieldSurface())
                    .focused($focused)
                    .accessibilityIdentifier("messageInput")
                    #if os(iOS)
                    .submitLabel(.send)
                    .onSubmit(send)
                    #endif
                Button(action: send) {
                    ZStack {
                        Image(systemName: "arrow.up")
                            .font(.title3.weight(.semibold))
                            .opacity(sending ? 0 : 1)
                        if sending { ProgressView().controlSize(.small) }
                    }
                    .frame(width: 22, height: 22)
                }
                .chatGlassButton(prominent: true)
                .buttonBorderShape(.circle)
                .controlSize(.large)
                #if os(macOS)
                .keyboardShortcut(.return, modifiers: .command)
                #endif
                .disabled(!canSend)
                .accessibilityLabel(text["chat.send"])
                .accessibilityIdentifier("sendMessage")
            }
            if draft.utf16.count > 4000 {
                Text(text["chat.too_long"]).font(.caption).foregroundStyle(.red)
            }
            if let errorKey {
                Label(text[errorKey], systemImage: "exclamationmark.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, horizontalPadding)
        .padding(.vertical, 10)
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
    }

    private var canSend: Bool {
        !sending && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draft.utf16.count <= 4000
    }

    private func send() {
        guard canSend else { return }
        let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        sending = true
        errorKey = nil
        Task {
            if let id = await store.createAndSend(value) {
                draft = ""
                onCreated(id)
            } else {
                errorKey = store.errorKey ?? "chat.delivery_unknown"
            }
            sending = false
        }
    }

    private var horizontalPadding: CGFloat {
        #if os(iOS)
        16
        #else
        20
        #endif
    }
}
