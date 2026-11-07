import SwiftUI
import YunCore
import YunUI

struct DesktopRoot: View {
    let store: DesktopStore
    let chat: ChatStore
    let onReady: (OpenWindowAction) -> Void
    @Environment(\.openWindow) private var openWindow
    enum Destination: Hashable { case quickActions, personas, cloud, status, groups, session(String) }
    @State private var selected: Destination? = .cloud
    @State private var search = ""
    @State private var showArchived = false
    @Environment(\.scenePhase) private var scenePhase
    private var visible: [SessionSummary] {
        chat.sessions.filter {
            ($0.archived == true) == showArchived && (search.isEmpty || [$0.title, $0.workspace, $0.provider, $0.model]
                .compactMap { $0 }
                .joined(separator: " ")
                .localizedCaseInsensitiveContains(search))
        }
    }
    var body: some View {
        NavigationSplitView {
            List(selection: $selected) {
                Label(store.text("connect.title"), systemImage: "network").tag(Destination.cloud)
                Label(store.text("tab.status"), systemImage: "antenna.radiowaves.left.and.right").tag(Destination.status)
                Label(store.text("quickActions"), systemImage: "bolt").tag(Destination.quickActions)
                Label(store.text("personas"), systemImage: "person.crop.rectangle").tag(Destination.personas)
                if chat.device != nil {
                    Label(store.text("groups.title"), systemImage: "person.3").tag(Destination.groups)
                    Toggle(store.text("sessions.category.archived"), isOn: $showArchived)
                    GroupedSessionRows(sessions: visible, store: chat, destination: Destination.session)
                }
            }
            .navigationSplitViewColumnWidth(min: 210, ideal: 270, max: 360)
            .searchable(text: $search, prompt: store.text("sessions.search"))
            .safeAreaInset(edge: .bottom) {
                SettingsLink { Label(store.text("settings"), systemImage: "gearshape") }
                    .buttonStyle(.plain).padding().frame(maxWidth: .infinity, alignment: .leading)
            }
        } detail: {
            Group {
                switch selected {
                case .cloud, nil:
                    NativeChatConnection(desktop: store, chat: chat)
                        .navigationTitle(store.text("connect.title"))
                case .status: CloudBotStatusView(store: chat)
                case .groups:
                    BotGroupsView(store: chat) { id in showArchived = false; selected = .session(id) }
                case .session(let id):
                    if let summary = chat.sessions.first(where: { $0.id == id }), let client = chat.client {
                        ConversationScreen(session: summary, client: client).id(id)
                    } else { ContentUnavailableView(store.text("sessions.empty"), systemImage: "bubble.left.and.bubble.right") }
                case .quickActions, .personas:
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            ClientMessages(error: store.error, note: store.state.note, pending: store.state.pending, pendingLabel: store.text("pending"))
                            if selected == .personas { PersonasView(store: store) }
                            else { QuickActionsView(store: store) }
                        }.padding(28).frame(maxWidth: 900, alignment: .leading).frame(maxWidth: .infinity, alignment: .topLeading)
                    }.navigationTitle(store.text(selected == .personas ? "personas" : "quickActions"))
                }
            }
            .toolbar {
                ToolbarItemGroup {
                    if chat.device != nil {
                        Button { Task { if let id = await chat.create() { selected = .session(id) } } } label: { Label(store.text("sessions.new"), systemImage: "square.and.pencil") }
                            .disabled(chat.busy)
                    }
                    Button { Task { await chat.refresh() } } label: { Label(store.text("refresh"), systemImage: "arrow.clockwise") }
                        .disabled(chat.client == nil)
                }
            }
        }
        .frame(minWidth: 700, minHeight: 540)
        .onAppear { onReady(openWindow) }
        .onChange(of: selected) { _, value in
            if value == .personas { store.send("navigate", "personas") }
            else if value == .quickActions { store.send("navigate", "quickActions") }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled { await chat.refresh(); try? await Task.sleep(for: .seconds(5)) }
        }
        .alert(store.text("busyTitle"), isPresented: Binding(get: { !store.state.confirmation.isEmpty }, set: {
            if !$0 { store.send("cancelInterrupt") }
        })) {
            Button(store.text("continue"), role: .cancel) { store.send("cancelInterrupt") }.keyboardShortcut(.defaultAction)
            Button(store.text("interrupt"), role: .destructive) { store.send("confirmInterrupt", store.state.confirmation) }
        } message: { Text(store.text("busyDetail")) }
    }
}
