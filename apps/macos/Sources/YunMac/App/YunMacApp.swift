import AppKit
import SwiftUI
import YunCore
import YunUI

@main struct YunMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var store = DesktopStore()
    @State private var chat = ChatStore()
    @State private var yunleAccount = YunleAccountStore()

    var body: some Scene {
        WindowGroup(store.text("appName"), id: "main", for: String.self) { _ in
            DesktopRoot(store: store, chat: chat) { openWindow in
                delegate.stopController = { store.stopController() }
                delegate.reopenWindow = { openWindow(id: "main", value: "main") }
                store.startController()
                store.onPairing = { server, code in
                    Task { await chat.pair(server: server, code: code, name: Host.current().localizedName ?? "Mac") }
                }
            }
            .environment(\.locale, Locale(identifier: store.state.locale))
            .environment(\.yunStrings, YunStrings(preference: store.state.locale))
            .task { await chat.restore() }
            .task { await yunleAccount.restore() }
        } defaultValue: { "main" }
        .defaultSize(width: 920, height: 680)
        .windowToolbarStyle(.unified)
        .commands {
            CommandGroup(after: .newItem) { ShowMainButton(store: store) }
            CommandGroup(after: .toolbar) {
                Button(store.text("refresh")) {
                    store.send(store.state.page == .personas ? "refreshPersonas" : "refreshStatus")
                }.keyboardShortcut("r").disabled(store.disabled)
            }
        }
        Settings {
            DesktopSettings(store: store, chat: chat, yunleAccount: yunleAccount)
                .environment(\.locale, Locale(identifier: store.state.locale))
                .environment(\.yunStrings, YunStrings(preference: store.state.locale))
        }
        Window(store.text("logs"), id: "logs") {
            LogView(store: store).environment(\.locale, Locale(identifier: store.state.locale))
        }.defaultSize(width: 760, height: 500)
        MenuBarExtra { TrayMenu(store: store) } label: {
            Image(nsImage: DesktopIntegration.trayIcon).accessibilityLabel(store.text("appName"))
        }
    }
}

private struct ShowMainButton: View {
    let store: DesktopStore
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        Button(store.text("showWindow")) { openWindow(id: "main", value: "main"); NSApp.activate(ignoringOtherApps: true) }
            .keyboardShortcut("0")
    }
}

private struct TrayMenu: View {
    let store: DesktopStore
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        ShowMainButton(store: store)
        Button(store.text("openCloud")) {
            store.openDSHWeb()
            openWindow(id: "main", value: "main")
            NSApp.activate(ignoringOtherApps: true)
        }
        Divider()
        SettingsLink { Text(store.text("settings")) }
        Divider()
        Button(store.text("quit")) { NSApp.terminate(nil) }.keyboardShortcut("q")
    }
}
