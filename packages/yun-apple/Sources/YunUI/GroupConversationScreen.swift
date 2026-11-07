import SwiftUI
import YunCore

public struct GroupConversationScreen: View {
    @State private var model: GroupChatStore
    @State private var information: ConversationStore
    @State private var followLatest = true
    @State private var openedDebugSender = false
    private enum Panel: Identifiable {
        case information
        case sender(GroupTransportMessage)
        var id: String {
            switch self {
            case .information: "information"
            case .sender(let message): "sender:\(message.id)"
            }
        }
    }
    @State private var panel: Panel?
    @Environment(\.yunStrings) private var text
    @Environment(\.scenePhase) private var scenePhase

    public init(session: SessionSummary, client: MobileAPI) {
        _model = State(initialValue: GroupChatStore(session: session, client: client))
        _information = State(initialValue: ConversationStore(session: session, client: client))
    }
    public var body: some View {
        ScrollViewReader { reader in
            ScrollView {
                LazyVStack(spacing: 16) {
                    Text(text["qq.capture.notice"]).font(.caption).foregroundStyle(.secondary).padding(.vertical, 8)
                    if model.hasMore {
                        Button(text["chat.older"]) { followLatest = false; Task { await model.refresh(older: true) } }
                    }
                    if model.messages.isEmpty && !model.loading {
                        ContentUnavailableView(text["qq.empty"], systemImage: "person.3.sequence", description: Text(text["qq.empty.detail"]))
                    }
                    ForEach(model.messages) { message in
                        GroupMessageBubble(message: message, senderRole: senderRole(for: message), appId: model.summary.source?.appId) {
                            panel = .sender(message)
                        }
                    }
                    Color.clear.frame(height: 1).id("group-bottom")
                }
                .padding().frame(maxWidth: 760).frame(maxWidth: .infinity)
            }
            .simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { _ in followLatest = false })
            .overlay(alignment: .bottomTrailing) {
                if !followLatest {
                    Button { followLatest = true; reader.scrollTo("group-bottom", anchor: .bottom) } label: {
                        Label(text["qq.latest"], systemImage: "arrow.down")
                    }.buttonStyle(.bordered).padding()
                }
            }
            .onChange(of: model.messages.last?.id) { _, _ in
                if followLatest { reader.scrollTo("group-bottom", anchor: .bottom) }
            }
        }
        .navigationTitle(model.summary.displayTitle)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            Menu {
                if let catalog = information.modelCatalog {
                    ForEach(catalog.groups) { group in
                        Section(group.name) {
                            ForEach(group.models) { option in
                                Button(option.name) { Task { await information.switchModel(provider: group.id, model: option.id) } }
                            }
                        }
                    }
                }
            } label: {
                Label(information.currentModelName.isEmpty ? text["chat.info.model"] : information.currentModelName, systemImage: "brain")
            }
            .disabled(model.state?.control == nil || information.switchingModel || information.modelCatalog?.groups.isEmpty != false)
            .accessibilityIdentifier("groupModelPicker")
            ContextUsageButton(context: model.state?.context ?? model.summary.context) { panel = .information }
        }
        .safeAreaInset(edge: .bottom) { composer }
        .sheet(item: $panel) { panel in
            switch panel {
            case .information:
                ConversationInfoView(model: information)
            case .sender(let message):
                GroupSenderInfoView(
                    message: message,
                    role: senderRole(for: message),
                    appId: model.summary.source?.appId,
                    sessionId: model.summary.id,
                    client: model.client
                )
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await information.loadModels(force: true)
            while !Task.isCancelled {
                await model.refresh()
                #if DEBUG
                if !openedDebugSender,
                   ProcessInfo.processInfo.arguments.contains("--open-last-sender"),
                   let message = model.messages.last(where: { !$0.outgoing }) {
                    openedDebugSender = true
                    panel = .sender(message)
                }
                #endif
                try? await Task.sleep(for: .seconds(model.manual || model.pausing ? 2 : 5))
            }
        }
    }

    private func senderRole(for message: GroupTransportMessage) -> String? {
        if let role = message.senderRole { return role }
        guard let latest = model.summary.source?.lastMessage, latest.id == message.messageId else { return nil }
        return latest.senderRole
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let error = model.errorKey {
                Label(text[error], systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.secondary)
            }
            if let pending = model.pending {
                Text(pending.text).lineLimit(3).font(.subheadline)
                Text(text["qq.delivery.unknown"]).font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button(text["qq.retry.same"]) { Task { await model.retry() } }
                    Button(text["qq.retry.acknowledge"]) { Task { await model.acknowledgeUnknown() } }
                }.font(.caption).disabled(model.busy)
            }
            if model.state == nil {
                if model.loading { ProgressView() }
            } else if model.state?.control == nil {
                Label(text[model.summary.archived == true ? "sessions.error.archived" : "qq.history"], systemImage: "clock.arrow.circlepath")
                    .font(.footnote).foregroundStyle(.secondary)
            } else {
                HStack {
                    Label(text[model.pausing ? "qq.pausing" : model.manual ? "qq.manual" : "qq.automatic"],
                          systemImage: model.manual ? "hand.raised.fill" : "sparkles")
                        .font(.subheadline.weight(.medium))
                    Spacer()
                    if model.busy { ProgressView().controlSize(.small) }
                    if model.manual {
                        Button(text["qq.resume"]) { Task { await model.resume() } }
                            .accessibilityIdentifier("resumeGroupBot").disabled(model.busy)
                    } else {
                        Button(text[model.pausing ? "qq.takeover.retry" : "qq.takeover"]) { Task { await model.takeover() } }
                            .accessibilityIdentifier("takeoverGroupBot").disabled(model.busy || model.state?.online != true)
                    }
                }
                if model.manual {
                    Text(text["qq.manual.detail"]).font(.caption).foregroundStyle(.secondary)
                    if let lease = model.state?.control?.lease {
                        HStack {
                            Text(text["qq.expires"])
                            Text(lease.expiry, style: .relative).environment(\.locale, Locale(identifier: text.locale))
                        }.font(.caption).foregroundStyle(.secondary)
                    }
                    Picker(text["qq.send.mode"], selection: $model.mode) {
                        Text(text["qq.reply"]).tag("reply")
                        Text(text["qq.proactive"]).tag("proactive")
                    }.pickerStyle(.segmented).disabled(model.busy || model.pending != nil)
                    if model.mode == "reply", model.state?.control?.replyAvailable != true {
                        Text(text["qq.error.reply"]).font(.caption).foregroundStyle(.secondary)
                    }
                    if model.mode == "proactive" {
                        Text(text["qq.permission." + (model.state?.control?.proactivePermission ?? "unknown")])
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    TextField(text["qq.compose"], text: $model.draft, axis: .vertical)
                        .lineLimit(1...4)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(.background, in: RoundedRectangle(cornerRadius: 14))
                        .accessibilityLabel(text["qq.compose"])
                        .accessibilityIdentifier("groupManualDraft")
                        .disabled(model.busy || model.pending != nil)
                    HStack {
                        Text("\(model.draft.utf16.count)/1200").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button(text["chat.send"]) { Task { await model.send() } }
                            .buttonStyle(.borderedProminent).disabled(!model.canSend)
                            .accessibilityIdentifier("sendGroupMessage")
                    }
                } else {
                    Text(text[model.pausing ? "qq.pausing.detail" : "qq.automatic.detail"]).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding().frame(maxWidth: 760).frame(maxWidth: .infinity)
        .background(.bar)
    }
}

private struct GroupMessageBubble: View {
    let message: GroupTransportMessage
    let senderRole: String?
    let appId: String?
    let openSender: () -> Void
    @Environment(\.yunStrings) private var text
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.outgoing { Spacer(minLength: 44) }
            if !message.outgoing {
                Button(action: openSender) {
                    QQAvatar(appId: appId, openId: message.senderId, name: message.senderName, size: 32)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .padding(.top, 1)
                .accessibilityLabel(text["chat.sender.open"])
            }
            VStack(alignment: message.outgoing ? .trailing : .leading, spacing: 5) {
                HStack(spacing: 6) {
                    if !message.outgoing, let role = senderRole, role != "member" {
                        GroupRoleBadge(role: role)
                    }
                    Text(message.outgoing ? text[message.manual == true ? "qq.sender.manual" : "qq.sender.bot"] : message.senderName ?? String(message.senderId?.prefix(12) ?? ""))
                        .lineLimit(1)
                }
                .font(.caption2).foregroundStyle(.secondary)
                GroupMessageContent(message: message)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .foregroundStyle(message.outgoing ? Color.white : Color.primary)
                    .background(message.outgoing ? Color.accentColor : Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 20))
                    .frame(maxWidth: 560, alignment: message.outgoing ? .trailing : .leading)
                HStack(spacing: 6) {
                    Text(message.createdAt, style: .time)
                    if message.outgoing, let status = message.status { Text(text["qq.delivery." + status]) }
                }.font(.caption2).foregroundStyle(.secondary)
            }
            if !message.outgoing { Spacer(minLength: 44) }
        }
        .accessibilityIdentifier("groupMessage.\(message.direction).\(message.id)")
    }
}

