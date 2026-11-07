import Foundation
import SwiftUI
import YunCore

private enum SessionConversationKind: String {
    case direct
    case group

    init?(session: SessionSummary) {
        if let kind = session.source?.kind, let value = Self(rawValue: kind) {
            self = value
        } else {
            self.init(workspace: session.workspace)
        }
    }

    init?(workspace: String?) {
        guard let workspace else { return nil }
        if workspace.contains("群聊") || workspace.localizedCaseInsensitiveContains("group") {
            self = .group
        } else if workspace.contains("私聊")
            || workspace.localizedCaseInsensitiveContains("direct")
            || workspace.localizedCaseInsensitiveContains("private") {
            self = .direct
        } else {
            return nil
        }
    }

    var symbol: String {
        switch self {
        case .direct: "bubble.left"
        case .group: "person.3"
        }
    }

    var localizationKey: String {
        switch self {
        case .direct: "sessions.kind.direct"
        case .group: "sessions.kind.group"
        }
    }

    func workspaceName(_ workspace: String) -> String {
        let parts = workspace.components(separatedBy: "·")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard parts.count > 1, matches(scopeName: parts.last ?? "") else { return workspace }
        let name = parts.dropLast().filter { !$0.isEmpty }.joined(separator: " · ")
        return name.isEmpty ? workspace : name
    }

    private func matches(scopeName: String) -> Bool {
        let value = scopeName.localizedLowercase
        switch self {
        case .direct:
            return value == "私聊" || value == "direct" || value == "private"
        case .group:
            return value == "群聊" || value == "group"
        }
    }
}

struct QQPlatformIcon: View {
    var body: some View {
        Image("qq", bundle: .module)
            .resizable()
            .scaledToFit()
            .foregroundStyle(Color.accentColor)
            .accessibilityLabel("QQ")
    }
}

private struct YunStringsKey: EnvironmentKey { static let defaultValue = YunStrings() }
public extension EnvironmentValues {
    var yunStrings: YunStrings {
        get { self[YunStringsKey.self] }
        set { self[YunStringsKey.self] = newValue }
    }
}

public struct SessionRows<Destination: Hashable>: View {
    let sessions: [SessionSummary]
    let destination: (String) -> Destination
    let store: ChatStore?
    @Environment(\.yunStrings) private var text
    public init(sessions: [SessionSummary], store: ChatStore? = nil, destination: @escaping (String) -> Destination) {
        self.store = store
        self.sessions = sessions; self.destination = destination
    }
    public var body: some View {
        ForEach(sessions) { session in
            let kind = SessionConversationKind(session: session)
            NavigationLink(value: destination(session.id)) {
                HStack(spacing: 10) {
                    Group {
                        if session.source?.platform == "qq" {
                            QQSessionAvatar(session: session)
                        } else {
                            Image(systemName: kind?.symbol ?? "bubble.left.and.bubble.right")
                                .foregroundStyle(kind == .group ? Color.orange : Color.accentColor)
                        }
                    }
                    .frame(width: 30, height: 30)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(session.displayTitle).lineLimit(1).fontWeight(.medium)
                            Spacer(minLength: 0)
                            Text(session.updatedAt, format: .dateTime.month(.twoDigits).day(.twoDigits).hour().minute())
                                .font(.caption2).foregroundStyle(.tertiary)
                        }
                        if kind != nil || session.workspace != nil {
                            HStack(spacing: 6) {
                                if let kind {
                                    Label(text[kind.localizationKey], systemImage: kind.symbol)
                                        .labelStyle(.titleAndIcon)
                                        .font(.caption2.weight(.semibold))
                                        .fixedSize()
                                        .foregroundStyle(kind == .group ? Color.orange : Color.accentColor)
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 2)
                                        .background(
                                            (kind == .group ? Color.orange : Color.accentColor).opacity(0.12),
                                            in: Capsule()
                                        )
                                }
                                if let workspace = session.workspace {
                                    Text(kind?.workspaceName(workspace) ?? workspace)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                            }
                        }
                        if let message = session.source?.lastMessage {
                            Text(messagePreview(message))
                                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                    if let operation = store?.sessionOperation, operation.sessionId == session.id {
                        ProgressView(text[operation.localizationKey])
                            .font(.caption).controlSize(.small)
                            .accessibilityIdentifier("sessionOperation.\(session.id)")
                    } else if session.running { ProgressView().controlSize(.small) }
                }.padding(.vertical, 4)
            }
            .accessibilityIdentifier("sessionRow.\(session.id)")
            .disabled(store?.sessionOperation?.sessionId == session.id)
            .transition(.opacity)
            .modifier(SessionManagement(session: session, store: store))
        }
    }
    private func messagePreview(_ message: SessionInboundMessage) -> String {
        let content = message.text.isEmpty ? text["chat.message.\(message.type)"] : message.text
        if let sender = message.senderName { return "\(sender): \(content)" }
        return content
    }
}

private struct QQSessionAvatar: View {
    let session: SessionSummary

    var body: some View {
        if let message = session.source?.lastMessage,
           let appId = session.source?.appId,
           !message.senderId.isEmpty {
            ZStack(alignment: .bottomTrailing) {
                QQAvatar(appId: appId, openId: message.senderId, name: message.senderName, size: 28)
                QQPlatformIcon()
                    .frame(width: 9, height: 9)
                    .padding(2)
                    .background(.background, in: Circle())
                    .offset(x: 2, y: 2)
            }
            .frame(width: 30, height: 30)
            .accessibilityHidden(true)
        } else {
            Circle()
                .fill(Color.accentColor.opacity(0.12))
                .overlay { QQPlatformIcon().padding(7) }
                .frame(width: 30, height: 30)
                .accessibilityHidden(true)
        }
    }
}

public struct GroupedSessionRows<Destination: Hashable>: View {
    let sessions: [SessionSummary]
    let destination: (String) -> Destination
    let store: ChatStore?
    @Environment(\.yunStrings) private var text
    public init(sessions: [SessionSummary], store: ChatStore? = nil, destination: @escaping (String) -> Destination) {
        self.store = store
        self.sessions = sessions
        self.destination = destination
    }
    public var body: some View {
        ForEach(SessionTimeline.group(sessions)) { section in
            Section {
                SessionRows(sessions: section.sessions, store: store, destination: destination)
            } header: {
                Text(title(for: section))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(nil)
            }
        }
    }
    private func title(for section: SessionTimelineSection) -> String {
        switch section.period {
        case .today:
            return text["sessions.group.today"]
        case .yesterday:
            return text["sessions.group.yesterday"]
        case .lastSevenDays:
            return text["sessions.group.seven_days"]
        case .lastThirtyDays:
            return text["sessions.group.thirty_days"]
        case let .month(year, month):
            let date = Calendar.current.date(from: DateComponents(year: year, month: month)) ?? .distantPast
            return date.formatted(
                .dateTime.year().month(.wide)
                    .locale(Locale(identifier: text.locale))
            )
        }
    }
}

private struct MinimizeSearchToolbar: ViewModifier {
    func body(content: Content) -> some View {
        #if os(iOS)
        if #available(iOS 26.0, *) {
            content.searchToolbarBehavior(.minimize)
        } else {
            content
        }
        #else
        content
        #endif
    }
}

public struct ChatBrowser: View {
    let store: ChatStore
    @Environment(\.openModelSetupGuide) private var openModelSetupGuide
    @Environment(\.yunStrings) private var text
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selected: String?
    @State private var search = ""
    @State private var category: SessionCategory = .all
    @State private var path: [String] = []
    @State private var composing = false
    private static let composeRoute = "__compose__"
    private enum ManagementSheet: String, Identifiable {
        case groups
        var id: String { rawValue }
    }
    @State private var managementSheet: ManagementSheet?
    public init(store: ChatStore) { self.store = store }
    private var visible: [SessionSummary] {
        store.sessions.filter {
            $0.blank != true && category.includes($0) && (search.isEmpty || [$0.displayTitle, $0.title, $0.workspace, $0.provider, $0.model, $0.source?.platform]
                .compactMap { $0 }
                .joined(separator: " ")
                .localizedCaseInsensitiveContains(search))
        }
    }
    private var compact: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }
    public var body: some View {
        Group {
            if compact { compactBrowser }
            else { splitBrowser }
        }
        .sheet(item: $managementSheet) { _ in
            NavigationStack {
                BotGroupsView(store: store) { id in
                    category = .qq
                    search = ""
                    managementSheet = nil
                    selected = id
                }
                .toolbar { ToolbarItem(placement: .cancellationAction) {
                    Button(text["done"]) { managementSheet = nil }
                } }
            }
            #if os(macOS)
            .frame(minWidth: 420, minHeight: 440)
            #endif
        }
        .onChange(of: selected) { _, value in
            if value != nil { composing = false }
        }
        .onChange(of: store.sessions.map(\.id)) { _, ids in
            if let selected, !ids.contains(selected) { self.selected = nil; path = [] }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled { await store.refresh(); try? await Task.sleep(for: .seconds(5)) }
        }
        #if DEBUG
        .task {
            guard ProcessInfo.processInfo.arguments.contains("--open-first-group") else { return }
            for _ in 0..<40 {
                guard !Task.isCancelled else { return }
                if let group = store.sessions.first(where: { $0.source?.platform == "qq" && $0.source?.kind == "group" }) {
                    category = .qq
                    search = ""
                    selected = group.id
                    path = [group.id]
                    return
                }
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
        #endif
    }
    private var sessionSections: some View {
        Group {
            if store.online, openModelSetupGuide != nil {
                ModelSetupHint()
            }
            Section {
                categoryPicker
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
            if let error = store.sessionErrorKey ?? store.errorKey {
                Label(text[error], systemImage: "exclamationmark.circle").foregroundStyle(.secondary)
                    .accessibilityIdentifier("sessionManagementError")
            }
            if visible.isEmpty {
                Section {
                    ContentUnavailableView(text["sessions.empty"], systemImage: "bubble.left.and.bubble.right")
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            } else {
                GroupedSessionRows(sessions: visible, store: store, destination: { $0 })
            }
        }
    }
    private var sessionList: some View {
        List(selection: $selected) {
            sessionSections
        }
        .searchable(text: $search, placement: .sidebar, prompt: text["sessions.search"])
        .navigationTitle(text["tab.sessions"])
        .refreshable { await store.refresh() }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: store.sessionListRevision)
        .transaction { if reduceMotion { $0.disablesAnimations = true } }
        .toolbar {
            Button { managementSheet = .groups } label: { Label(text["groups.title"], systemImage: "person.3") }
                .accessibilityIdentifier("botGroups")
            Button { beginCompose() } label: { Label(text["sessions.new"], systemImage: "square.and.pencil") }
                .disabled(store.busy).accessibilityIdentifier("newSession")
        }
    }
    private var categoryPicker: some View {
        HStack(spacing: 4) {
            ForEach(SessionCategory.allCases, id: \.self) { item in
                Button {
                    category = item
                } label: {
                    HStack(spacing: 5) {
                        if item == .qq {
                            QQPlatformIcon()
                                .frame(width: 16, height: 16)
                                .accessibilityHidden(true)
                        }
                        Text(text[item.localizationKey])
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(category == item ? .primary : .secondary)
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .background {
                        if category == item {
                            RoundedRectangle(cornerRadius: 7)
                                .fill(.background)
                                .shadow(color: .black.opacity(0.08), radius: 2, y: 1)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(text[item.localizationKey])
                .accessibilityAddTraits(category == item ? .isSelected : [])
                .accessibilityIdentifier("sessionCategory.\(item.rawValue)")
            }
        }
        .padding(4)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
        .padding(.vertical, 8)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(text["sessions.category"])
        .accessibilityIdentifier("sessionCategory")
    }
    private var splitBrowser: some View {
        NavigationSplitView {
            sessionList
        } detail: {
            conversation
        }
    }
    private var compactBrowser: some View {
        NavigationStack(path: $path) {
            List { sessionSections }
                .searchable(text: $search, prompt: text["sessions.search"])
                .modifier(MinimizeSearchToolbar())
                .navigationTitle(text["tab.sessions"])
                .refreshable { await store.refresh() }
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: store.sessionListRevision)
                .transaction { if reduceMotion { $0.disablesAnimations = true } }
                .toolbar {
                    Button { managementSheet = .groups } label: { Label(text["groups.title"], systemImage: "person.3") }
                        .accessibilityIdentifier("botGroups")
                    Button { beginCompose() } label: { Label(text["sessions.new"], systemImage: "square.and.pencil") }
                        .disabled(store.busy).accessibilityIdentifier("newSession")
                }
                .navigationDestination(for: String.self) { route in
                    if route == Self.composeRoute { compose } else { conversation }
                }
                .onChange(of: selected) { _, newValue in
                    guard let newValue else { return }
                    composing = false
                    if path != [newValue] { path = [newValue] }
                }
                .onChange(of: path) { _, newValue in
                    if let first = newValue.first {
                        if first == Self.composeRoute {
                            selected = nil
                            composing = true
                        } else {
                            selected = first
                            composing = false
                        }
                    } else {
                        composing = false
                    }
                }
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                .listStyle(.insetGrouped)
                #endif
        }
    }
    @ViewBuilder private var conversation: some View {
        if composing {
            compose
        } else if let id = selected, let summary = store.sessions.first(where: { $0.id == id }), let client = store.client {
            ConversationScreen(session: summary, client: client).id(id)
        }
        else { ContentUnavailableView(text["sessions.empty.detail"], systemImage: "bubble.left.and.bubble.right") }
    }

    @ViewBuilder private var compose: some View {
        if store.client != nil {
            ComposeConversationScreen(store: store, onCreated: openCreated)
        } else {
            ContentUnavailableView(text["sessions.empty.detail"], systemImage: "bubble.left.and.bubble.right")
        }
    }

    private func beginCompose() {
        selected = nil
        composing = true
        if compact { path = [Self.composeRoute] }
    }

    private func openCreated(_ id: String) {
        composing = false
        selected = id
        if compact { path = [id] }
    }
}
