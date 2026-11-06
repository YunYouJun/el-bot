import SwiftUI
import YunBotCore

@main
struct YunBotApp: App {
    @State private var store = AppStore()
    @AppStorage("language") private var language = "system"

    var body: some Scene {
        WindowGroup {
            Group {
                if store.device != nil { CompanionView() }
                else { ConnectionView() }
            }
            .environment(store)
            .environment(\.locale, language == "system" ? .current : Locale(identifier: language))
            .task { await store.restore() }
        }
    }
}

private enum AppTab: Hashable { case sessions, status, settings }

struct CompanionView: View {
    @State private var tab: AppTab = .sessions

    var body: some View {
        TabView(selection: $tab) {
            Tab("tab.sessions", systemImage: "bubble.left.and.bubble.right", value: .sessions) {
                SessionsView()
            }
            Tab("tab.status", systemImage: "waveform.path.ecg", value: .status) {
                StatusView()
            }
            Tab("tab.settings", systemImage: "gearshape", value: .settings) {
                SettingsView()
            }
        }
    }
}
