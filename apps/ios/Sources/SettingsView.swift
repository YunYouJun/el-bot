import SwiftUI

struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.locale) private var locale
    @AppStorage("language") private var language = "system"
    @State private var confirmDisconnect = false

    var body: some View {
        NavigationStack {
            Form {
                Section("settings.device") {
                    LabeledContent("connect.device", value: store.device?.name ?? "—")
                    if let device = store.device {
                        LabeledContent("settings.expires") { Text(device.expiresAt, style: .date) }
                    }
                    LabeledContent("connect.server", value: store.client?.endpoint.origin.host() ?? "—")
                }
                Section("settings.appearance") {
                    Picker("settings.language", selection: $language) {
                        Text("settings.system").tag("system")
                        Text("简体中文").tag("zh-Hans")
                        Text("English").tag("en")
                    }
                    .accessibilityIdentifier("languagePicker")
                }
                Section {
                    Button("settings.disconnect", role: .destructive) { confirmDisconnect = true }
                } footer: { Text("settings.security") }
                Section {
                    LabeledContent("settings.version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0")
                }
            }
            .navigationTitle("tab.settings")
            .confirmationDialog("settings.disconnect.title", isPresented: $confirmDisconnect) {
                Button("settings.disconnect", role: .destructive) { Task { await store.disconnect() } }
                Button("action.cancel", role: .cancel) {}
            } message: { Text("settings.disconnect.detail") }
        }.id(locale.identifier)
    }
}
