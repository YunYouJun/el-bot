import SwiftUI
import YunCore
import YunUI

struct MobileRoot: View {
    let preferences: AppPreferences
    let chat: ChatStore
    let account: AccountSyncStore
    @State private var web = DSHWebController()
    @State private var tab: Tab = {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--show-bot") { return .status }
        if ProcessInfo.processInfo.arguments.contains("--show-device-tools") { return .tools }
        if ProcessInfo.processInfo.arguments.contains("--show-dsh-web") { return .web }
        #endif
        return .home
    }()
    enum Tab { case home, status, tools, web, settings }
    var body: some View {
        TabView(selection: $tab) {
            Group {
                if chat.device != nil { ChatBrowser(store: chat) }
                else { NavigationStack { ChatConnectionView(store: chat).navigationTitle(preferences.strings["connect.title"]) } }
            }.tabItem { Label(preferences.strings["tab.sessions"], systemImage: "bubble.left.and.bubble.right") }.tag(Tab.home)
            NavigationStack { MobileBotStatusView(store: chat) }
                .tabItem { Label(preferences.strings["tab.status"], systemImage: "antenna.radiowaves.left.and.right") }.tag(Tab.status)
            NavigationStack { MobileDeviceToolsView() }
                .tabItem { Label(preferences.strings["tools.title"], systemImage: "iphone.gen3") }.tag(Tab.tools)
            NavigationStack { MobileDSHWebView(chat: chat, controller: web) }
                .tabItem { Label(preferences.strings["web.title"], systemImage: "globe") }.tag(Tab.web)
            NavigationStack {
                MobileSettings(preferences: preferences, chat: chat, account: account)
                    .navigationTitle(preferences.strings["settings"])
            }.tabItem { Label(preferences.strings["settings"], systemImage: "gearshape") }.tag(Tab.settings)
        }
        .task(id: chat.device?.id) { await account.restore() }
        .onChange(of: preferences.language) { _, value in
            guard account.state.linked else { return }
            Task { await account.savePreferences(language: value) }
        }
    }
}
