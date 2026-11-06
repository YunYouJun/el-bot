import SwiftUI
import YunCore

private enum SessionConversationKind: Equatable {
    case direct
    case group

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
    @Environment(\.yunStrings) private var text
    public init(sessions: [SessionSummary], destination: @escaping (String) -> Destination) {
        self.sessions = sessions; self.destination = destination
    }
    public var body: some View {
        ForEach(sessions) { session in
            let kind = SessionConversationKind(workspace: session.workspace)
            NavigationLink(value: destination(session.id)) {
                HStack(spacing: 10) {
                    Image(systemName: kind?.symbol ?? "bubble.left.and.bubble.right")
                        .foregroundStyle(kind == .group ? Color.orange : Color.accentColor)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(session.title).lineLimit(1).fontWeight(.medium)
                        if kind != nil || session.workspace != nil {
                            HStack(spacing: 6) {
                                if let kind {
                                    Text(text[kind.localizationKey])
                                        .font(.caption2.weight(.semibold))
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
                        if let model = session.model { Text(model).font(.caption2).foregroundStyle(.tertiary).lineLimit(1) }
                    }
                    Spacer(minLength: 0)
                    if session.running { ProgressView().controlSize(.small) }
                }.padding(.vertical, 4)
            }
        }
    }
}

public struct GroupedSessionRows<Destination: Hashable>: View {
    let sessions: [SessionSummary]
    let destination: (String) -> Destination
    @Environment(\.yunStrings) private var text
    public init(sessions: [SessionSummary], destination: @escaping (String) -> Destination) {
        self.sessions = sessions
        self.destination = destination
    }
    public var body: some View {
        ForEach(SessionTimeline.group(sessions)) { section in
            Section {
                SessionRows(sessions: section.sessions, destination: destination)
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

public struct ChatBrowser: View {
    let store: ChatStore
    @Environment(\.yunStrings) private var text
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selected: String?
    @State private var search = ""
    @State private var path: [String] = []
    public init(store: ChatStore) { self.store = store }
    private var visible: [SessionSummary] {
        store.sessions.filter {
            search.isEmpty || [$0.title, $0.workspace, $0.provider, $0.model]
                .compactMap { $0 }
                .joined(separator: " ")
                .localizedCaseInsensitiveContains(search)
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
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled { await store.refresh(); try? await Task.sleep(for: .seconds(5)) }
        }
    }
    private var sessionRows: some View {
        Group {
            if let error = store.errorKey { Label(text[error], systemImage: "wifi.exclamationmark").foregroundStyle(.secondary) }
            GroupedSessionRows(sessions: visible, destination: { $0 })
        }
    }
    private var sessionList: some View {
        List(selection: $selected) {
            sessionRows
        }
        .overlay { if visible.isEmpty { ContentUnavailableView(text["sessions.empty"], systemImage: "bubble.left.and.bubble.right") } }
        .searchable(text: $search, prompt: text["sessions.search"])
        .navigationTitle(text["tab.sessions"])
        .refreshable { await store.refresh() }
        .toolbar {
            Button { Task { selected = await store.create() } } label: { Label(text["sessions.new"], systemImage: "square.and.pencil") }
                .disabled(store.busy).accessibilityIdentifier("newSession")
        }
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
            List { sessionRows }
                .overlay { if visible.isEmpty { ContentUnavailableView(text["sessions.empty"], systemImage: "bubble.left.and.bubble.right") } }
                .searchable(text: $search, prompt: text["sessions.search"])
                .navigationTitle(text["tab.sessions"])
                .refreshable { await store.refresh() }
                .toolbar {
                    Button { Task { selected = await store.create() } } label: { Label(text["sessions.new"], systemImage: "square.and.pencil") }
                        .disabled(store.busy).accessibilityIdentifier("newSession")
                }
                .navigationDestination(for: String.self) { _ in conversation }
                .onChange(of: selected) { _, newValue in
                    guard let newValue else { return }
                    if path != [newValue] { path = [newValue] }
                }
                .onChange(of: path) { _, newValue in
                    if newValue.first != selected { selected = newValue.first }
                }
                #if os(iOS)
                .listStyle(.insetGrouped)
                #endif
        }
    }
    @ViewBuilder private var conversation: some View {
        if let id = selected, let summary = store.sessions.first(where: { $0.id == id }), let client = store.client {
            ConversationScreen(session: summary, client: client).id(id)
        }
        else { ContentUnavailableView(text["sessions.empty.detail"], systemImage: "bubble.left.and.bubble.right") }
    }
}
