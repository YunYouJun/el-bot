import SwiftUI
import YunCore
import YunUI

struct DesktopRoot: View {
    let store: DesktopStore
    let chat: ChatStore
    let onReady: (OpenWindowAction) -> Void
    @Environment(\.openWindow) private var openWindow
    enum Destination: Hashable { case quickActions, personas, cloud, web, status, groups, compose, session(String) }
    @State private var selected: Destination? = .web
    @State private var columnVisibility: NavigationSplitViewVisibility = .detailOnly
    @State private var web = DesktopDSHWebController()
    @State private var search = ""
    @State private var category: SessionCategory = .all
    @State private var showModelGuide = false
    @Environment(\.scenePhase) private var scenePhase
    private var visible: [SessionSummary] {
        chat.sessions.filter {
            $0.blank != true && category.includes($0) && (search.isEmpty || [$0.displayTitle, $0.title, $0.workspace, $0.provider, $0.model, $0.source?.platform]
                .compactMap { $0 }
                .joined(separator: " ")
                .localizedCaseInsensitiveContains(search))
        }
    }
    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            DesktopSidebar(desktop: store, chat: chat, sessions: visible, selection: $selected, category: $category) {
                showModelGuide = true
            }
        } detail: {
            Group {
                switch selected {
                case .web:
                    DesktopDSHWebView(desktop: store, chat: chat, controller: web)
                case .cloud, nil:
                    NativeChatConnection(desktop: store, chat: chat)
                        .navigationTitle(store.text("connect.title"))
                case .status: CloudBotStatusView(store: chat)
                case .groups:
                    BotGroupsView(store: chat) { id in category = .all; selected = .session(id) }
                case .compose:
                    ComposeConversationScreen(store: chat) { id in selected = .session(id) }
                case .session(let id):
                    if let summary = chat.sessions.first(where: { $0.id == id }), let client = chat.client {
                        ConversationScreen(session: summary, client: client).id(id)
                    } else { ContentUnavailableView(store.text("sessions.empty"), systemImage: "bubble.left.and.bubble.right") }
                case .personas:
                    PersonasView(chat: chat)
                        .navigationTitle(store.text("personas"))
                case .quickActions:
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            ClientMessages(error: store.error, note: store.state.note, pending: store.state.pending, pendingLabel: store.text("pending"))
                            QuickActionsView(store: store)
                        }.padding(28).frame(maxWidth: 900, alignment: .leading).frame(maxWidth: .infinity, alignment: .topLeading)
                    }.navigationTitle(store.text("quickActions"))
                }
            }
            .toolbar {
                ToolbarItemGroup {
                    if selected != .web, chat.device != nil {
                        Button { selected = .compose } label: {
                            Label(store.text("sessions.new"), systemImage: "square.and.pencil")
                        }
                        .disabled(chat.busy || chat.client == nil)
                    }
                    if selected != .web {
                        Button { Task { await chat.refresh() } } label: { Label(store.text("refresh"), systemImage: "arrow.clockwise") }
                            .disabled(chat.client == nil)
                    }
                }
            }
        }
        .searchable(text: $search, prompt: store.text("sessions.search"))
        .frame(minWidth: 700, minHeight: 540)
        .environment(\.openModelSetupGuide, { showModelGuide = true })
        .sheet(isPresented: $showModelGuide) {
            ModelSetupGuide(connected: chat.device != nil) {
                showModelGuide = false
                selected = .web
            }
            .environment(\.locale, Locale(identifier: store.state.locale))
            .environment(\.yunStrings, YunStrings(preference: store.state.locale))
        }
        .onAppear { onReady(openWindow) }
        .onChange(of: store.webNavigationRequest) { _, _ in selected = .web }
        .onChange(of: selected) { _, value in
            if value == .web { columnVisibility = .detailOnly }
            if value == .personas { store.send("navigate", "personas") }
            else if value == .quickActions { store.send("navigate", "quickActions") }
        }
        .onChange(of: chat.device?.id) { _, value in web.resetIfDeviceChanged(value) }
        .onDisappear { web.reset() }
        .onChange(of: category) { _, _ in
            guard case let .session(id) = selected, !visible.contains(where: { $0.id == id }) else { return }
            selected = nil
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
