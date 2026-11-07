import SwiftUI
import YunCore

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

private struct ContentOffsetKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct ConversationInfoPresentation: Identifiable { let id: String }

private extension Color {
    static var userBubble: Color {
        Color.accentColor
    }

    static var assistantBubble: Color {
        #if os(iOS)
        Color(UIColor.secondarySystemBackground)
        #elseif os(macOS)
        Color(NSColor.controlBackgroundColor)
        #else
        Color.secondary.opacity(0.1)
        #endif
    }
}

public struct ConversationScreen: View {
    private let session: SessionSummary
    private let client: MobileAPI
    public init(session: SessionSummary, client: MobileAPI) { self.session = session; self.client = client }
    public var body: some View {
        if session.source?.platform == "qq", session.source?.kind == "group" {
            GroupConversationScreen(session: session, client: client)
        } else {
            ModelConversationScreen(session: session, client: client)
        }
    }
}

private struct ModelConversationScreen: View {
    @State private var model: ConversationStore
    @Environment(\.openModelSetupGuide) private var openModelSetupGuide
    @Environment(\.yunStrings) private var text
    @Environment(\.scenePhase) private var scenePhase
    @State private var followLatest = true
    @State private var lastOffset: CGFloat?
    @State private var information: ConversationInfoPresentation?
    init(session: SessionSummary, client: MobileAPI) {
        _model = State(initialValue: ConversationStore(session: session, client: client))
    }
    var body: some View {
        ScrollViewReader { reader in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if model.hasMore {
                        Button(text["chat.older"]) { followLatest = false; Task { await model.refresh(older: true) } }
                            .buttonStyle(.borderless).font(.footnote).foregroundStyle(.tint)
                    }
                    if model.messages.isEmpty && !model.summary.running {
                        ContentUnavailableView(text["chat.empty"], systemImage: "bubble.left", description: Text(text["chat.empty.detail"]))
                    }
                    ForEach(model.messages) { message in
                        MessageBubble(message: message, assistantName: text["app.name"]).equatable().id(message.id)
                    }
                    if model.summary.running {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text(text["chat.thinking"]).font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(Color.secondary.opacity(0.1), in: Capsule())
                    }
                    if let pending = model.pending {
                        HStack {
                            Spacer(minLength: 56)
                            VStack(alignment: .trailing, spacing: 7) {
                                Text(pending.text).lineLimit(3)
                                HStack(spacing: 10) {
                                    Text(text["chat.delivery_unknown"]).font(.caption2).foregroundStyle(.secondary)
                                    Button(text["chat.retry"]) { Task { await model.send(retry: true) } }
                                        .buttonStyle(.borderless).font(.caption).disabled(model.sending)
                                }
                            }
                            .frame(maxWidth: 560, alignment: .trailing)
                            .padding(.horizontal, 16).padding(.vertical, 11)
                            .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        }
                    }
                    if let error = model.errorKey { Label(text[error], systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.secondary) }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, Self.horizontalPadding).padding(.vertical, 16).frame(maxWidth: 760).frame(maxWidth: .infinity)
                .background(GeometryReader { proxy in Color.clear.preference(key: ContentOffsetKey.self, value: proxy.frame(in: .named("chat")).minY) })
            }
            .coordinateSpace(name: "chat")
            .onPreferenceChange(ContentOffsetKey.self) { offset in
                if let previous = lastOffset, offset > previous + 2 { followLatest = false }
                lastOffset = offset
            }
            #if os(iOS)
            .scrollDismissesKeyboard(.interactively)
            #endif
            .onChange(of: model.messages.last?.id) { _, _ in
                if followLatest { reader.scrollTo("bottom", anchor: .bottom) }
            }
            .overlay(alignment: .bottomTrailing) {
                if !followLatest {
                    Button { followLatest = true; reader.scrollTo("bottom", anchor: .bottom) } label: {
                        Label(text["chat.pause_scroll"], systemImage: "arrow.down")
                    }
                    .chatGlassButton()
                    .padding()
                }
            }
        }
        .navigationTitle(model.summary.displayTitle)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                ContextUsageButton(context: model.summary.context) {
                    information = ConversationInfoPresentation(id: model.summary.id)
                }
            }
        }
        .sheet(item: $information) { _ in ConversationInfoView(model: model) }
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .modifier(ConversationInputBar {
            if model.summary.archived == true {
                Label(text["sessions.error.archived"], systemImage: "archivebox").font(.footnote).padding()
            } else if model.summary.readOnly == true {
                Label(text["sessions.historical"], systemImage: "clock.arrow.circlepath").font(.footnote).padding()
            } else { composer }
        })
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await model.loadModels(force: true)
            while !Task.isCancelled {
                await model.refresh()
                try? await Task.sleep(for: .seconds(model.summary.running ? 2 : 5))
            }
        }
    }
    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                modelPicker
                Spacer(minLength: 12)
                if model.summary.running {
                    Label(text["chat.running"], systemImage: "waveform")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 8)
            if let catalog = model.modelCatalog, catalog.groups.isEmpty, let openModelSetupGuide {
                VStack(alignment: .leading, spacing: 4) {
                    Text(text["model.setup.empty"]).font(.caption).foregroundStyle(.secondary)
                    HStack {
                        Button(text["model.setup.view_guide"], action: openModelSetupGuide)
                            .accessibilityIdentifier("modelSetupEmptyGuide")
                        Spacer()
                        Button { Task { await model.loadModels(force: true) } } label: {
                            Label(text["refresh"], systemImage: "arrow.clockwise")
                        }
                        .disabled(model.loadingModels)
                        .accessibilityIdentifier("modelSetupRefresh")
                    }.font(.caption).buttonStyle(.borderless)
                }.padding(.horizontal, 8)
            }
            if #available(iOS 26, macOS 26, *) {
                GlassEffectContainer(spacing: 8) { composerControls }
            } else {
                composerControls
            }
            if let error = model.modelErrorKey {
                Text(text[error])
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
            }
            if model.draft.utf16.count > 4000 { Text(text["chat.too_long"]).font(.caption).foregroundStyle(.red) }
        }
        .padding(.horizontal, Self.horizontalPadding)
        .padding(.vertical, 10)
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
    }
    private var modelPicker: some View {
        let groups = model.modelCatalog?.groups ?? []
        return Menu {
            if groups.isEmpty {
                Button(text["chat.model.none"]) {}
                    .disabled(true)
            } else {
                ForEach(groups) { provider in
                    Section(provider.name) {
                        ForEach(provider.models) { option in
                            Button {
                                Task { await model.switchModel(provider: provider.id, model: option.id) }
                            } label: {
                                if model.currentModel?.provider == provider.id && model.currentModel?.model == option.id {
                                    Label(option.name, systemImage: "checkmark")
                                } else {
                                    Text(option.name)
                                }
                            }
                        }
                    }
                }
                if model.summary.running {
                    Divider()
                    Text(text["chat.model.next_request"])
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "cpu")
                Text(model.currentModelName.isEmpty ? text["chat.model.default"] : model.currentModelName)
                    .lineLimit(1)
                if model.switchingModel {
                    ProgressView().controlSize(.mini)
                } else {
                    Image(systemName: "chevron.down").font(.caption2.weight(.semibold))
                }
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .modifier(ModelPickerSurface())
        }
        .disabled(model.switchingModel || groups.isEmpty)
        .accessibilityLabel(text["chat.model.select"])
        .accessibilityValue(model.currentModelName)
        .accessibilityHint(text["chat.model.next_request"])
        .accessibilityIdentifier("modelPicker")
    }
    private var composerControls: some View {
        HStack(alignment: .bottom, spacing: 12) {
            messageField
            Button { sendDraft() } label: {
                ZStack {
                    Image(systemName: "arrow.up")
                        .font(.title3.weight(.semibold))
                        .opacity(model.sending ? 0 : 1)
                    if model.sending { ProgressView().controlSize(.small) }
                }
                .frame(width: 22, height: 22)
            }
            .chatGlassButton(prominent: true)
            .buttonBorderShape(.circle)
            .controlSize(.large)
            #if os(macOS)
            .keyboardShortcut(.return, modifiers: .command)
            #endif
            .disabled(!canSendDraft)
            .accessibilityLabel(text[model.summary.running ? "chat.queue" : "chat.send"])
            .accessibilityIdentifier("sendMessage")
        }
    }
    @ViewBuilder private var messageField: some View {
        TextField(text["chat.placeholder"], text: $model.draft, axis: .vertical)
            .font(.body)
            .lineLimit(1...6)
            .textFieldStyle(.plain)
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .frame(minHeight: 50)
            .modifier(ConversationFieldSurface())
            .accessibilityIdentifier("messageInput")
            #if os(iOS)
            .submitLabel(.send)
            .onSubmit { sendDraft() }
            #endif
    }
    private var canSendDraft: Bool {
        model.canSend && !model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && model.draft.utf16.count <= 4000
    }
    private func sendDraft() {
        guard canSendDraft else { return }
        followLatest = true
        Task { await model.send() }
    }
    private static var horizontalPadding: CGFloat {
        #if os(iOS)
        16
        #else
        20
        #endif
    }
}

struct ConversationInputBar<Bar: View>: ViewModifier {
    @ViewBuilder var bar: () -> Bar

    func body(content: Content) -> some View {
        if #available(iOS 26, macOS 26, *) {
            content.safeAreaBar(edge: .bottom, spacing: 0, content: bar)
        } else {
            content.safeAreaInset(edge: .bottom, spacing: 0) { bar().background(.bar) }
        }
    }
}

struct ConversationFieldSurface: ViewModifier {
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 26, style: .continuous)
        if #available(iOS 26, macOS 26, *) {
            content.glassEffect(.regular.interactive(), in: shape)
        } else {
            content.background(.regularMaterial, in: shape)
        }
    }
}

private struct ModelPickerSurface: ViewModifier {
    func body(content: Content) -> some View {
        let shape = Capsule(style: .continuous)
        if #available(iOS 26, macOS 26, *) {
            content.glassEffect(.regular.interactive(), in: shape)
        } else {
            content.background(.thinMaterial, in: shape)
        }
    }
}

extension View {
    @ViewBuilder func chatGlassButton(prominent: Bool = false) -> some View {
        if #available(iOS 26, macOS 26, *) {
            if prominent { buttonStyle(.glassProminent) }
            else { buttonStyle(.glass) }
        } else {
            if prominent { buttonStyle(.borderedProminent) }
            else { buttonStyle(.bordered) }
        }
    }
}

private struct MessageBubble: View, Equatable {
    let message: ChatMessage
    let assistantName: String
    private var user: Bool { message.role == "user" }
    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if user { Spacer(minLength: 44) }
            VStack(alignment: user ? .trailing : .leading, spacing: 5) {
                if !user {
                    Text(assistantName).font(.caption2).foregroundStyle(.tertiary)
                        .padding(.leading, 5)
                }
                Text((try? AttributedString(markdown: message.text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(message.text))
                    .textSelection(.enabled)
                    .font(.body)
                    .lineSpacing(3)
                    .foregroundStyle(user ? .white : .primary)
                    .tint(user ? .white : .accentColor)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(user ? Color.userBubble : Color.assistantBubble, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .frame(maxWidth: 560, alignment: user ? .trailing : .leading)
                Text(message.createdAt, style: .time).font(.caption2).foregroundStyle(.tertiary)
                    .padding(.horizontal, 5)
            }
            if !user { Spacer(minLength: 44) }
        }
    }
}
