import SwiftUI
import YunBotCore

struct SessionsView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.locale) private var locale
    @Environment(\.scenePhase) private var scenePhase
    @State private var search = ""
    @State private var path: [SessionSummary] = []

    private var visible: [SessionSummary] {
        guard !search.isEmpty else { return store.sessions }
        return store.sessions.filter { ($0.title + " " + ($0.workspace ?? "")).localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if let error = store.errorKey {
                    Section { Label(LocalizedStringKey(error), systemImage: "wifi.exclamationmark").foregroundStyle(.secondary).font(.footnote) }
                }
                ForEach(visible) { session in
                    NavigationLink(value: session) {
                        HStack(spacing: 12) {
                            Image(systemName: session.workspace?.contains("群聊") == true ? "person.3.fill" : "bubble.left.and.bubble.right.fill")
                                .foregroundStyle(.tint).frame(width: 30)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(session.title).lineLimit(1).fontWeight(.medium)
                                if let workspace = session.workspace { Text(workspace).font(.caption).foregroundStyle(.secondary) }
                                if let model = session.model { Text(model).font(.caption2).foregroundStyle(.tertiary) }
                            }
                            Spacer()
                            if session.running { ProgressView().controlSize(.small) }
                            else { Text(session.updatedAt, style: .relative).font(.caption2).foregroundStyle(.secondary) }
                        }.padding(.vertical, 5)
                    }
                }
            }
            .overlay {
                if visible.isEmpty && store.errorKey == nil {
                    ContentUnavailableView("sessions.empty", systemImage: "bubble.left.and.bubble.right", description: Text("sessions.empty.detail"))
                }
            }
            .navigationTitle("tab.sessions")
            .searchable(text: $search, prompt: "sessions.search")
            .refreshable { await store.refresh() }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("sessions.new", systemImage: "square.and.pencil") {
                        Task {
                            if let id = await store.create(), let created = store.sessions.first(where: { $0.id == id }) { path.append(created) }
                        }
                    }.disabled(store.busy).accessibilityIdentifier("newSession")
                }
            }
            .navigationDestination(for: SessionSummary.self) { session in
                if let client = store.client { ConversationView(session: session, client: client) }
            }
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                while !Task.isCancelled {
                    await store.refresh()
                    try? await Task.sleep(for: .seconds(5))
                }
            }
        }.id(locale.identifier)
    }
}
