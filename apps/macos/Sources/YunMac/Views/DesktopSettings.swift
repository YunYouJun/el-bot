import SwiftUI
import YunUI
import YunCore

struct DesktopSettings: View {
    let store: DesktopStore
    let chat: ChatStore
    var body: some View {
        TabView {
            NativeChatConnection(desktop: store, chat: chat)
                .tabItem { Label(store.text("tab.sessions"), systemImage: "bubble.left.and.bubble.right") }
            connection.tabItem { Label(store.text("cloud"), systemImage: "network") }
            local.tabItem { Label(store.text("environment"), systemImage: "terminal") }
            replies.tabItem { Label(store.text("preferences"), systemImage: "text.bubble") }
        }.padding(16).frame(width: 660, height: 590)
    }
    private var connection: some View {
        Form {
            Section {
                LanguagePicker(title: store.text("language"), systemLabel: store.text("followSystem"), selection: Binding(get: { store.state.localePreference }, set: { store.send("locale", $0) }))
            }
            Section {
                TextField(store.text("sshHost"), text: store.draft("sshHost")).autocorrectionDisabled().disabled(store.disabled)
                Text(store.text("cloudHint")).font(.caption).foregroundStyle(.secondary)
                Button(store.text("saveCloud")) { store.send("saveCloud") }.disabled(store.disabled)
            } header: { Text(store.text("cloud")) }
            messages
        }.formStyle(.grouped)
    }
    private var local: some View {
        Form {
            Section {
                ForEach(["nodePath", "cliPath", "configPath", "credentialsPath", "statePath", "codexAppPath", "codebuddyAppPath", "dshAppPath", "qqAppPath"], id: \.self) { field in
                    LabeledContent(store.text(field)) {
                        HStack {
                            TextField(store.text(field), text: store.draft(field)).labelsHidden().autocorrectionDisabled()
                            Button { DesktopIntegration.choose(field, store: store) } label: { Image(systemName: "folder") }
                                .help(store.text("choose")).accessibilityLabel(store.text("choose") + " " + store.text(field))
                        }
                    }
                }
                Text(store.text("savedPathsHint")).font(.caption).foregroundStyle(.secondary)
                Button(store.text("saveSettings")) { store.send("saveLocal") }
            }.disabled(store.disabled)
            messages
        }.formStyle(.grouped)
    }
    private var replies: some View {
        Form {
            Section {
                Picker(store.text("messageFormat"), selection: store.preference("messageFormat")) {
                    ForEach(["image", "markdown", "text"], id: \.self) { Text(store.text($0)).tag($0) }
                }.disabled(!store.state.preferencesLoaded || store.disabled)
                Picker(store.text("imageTheme"), selection: store.preference("imageTheme")) {
                    ForEach(["light", "dark"], id: \.self) { Text(store.text($0)).tag($0) }
                }.disabled(!store.state.preferencesLoaded || store.disabled)
                HStack {
                    Button(store.text("readPreferences")) { store.send("readPreferences") }.disabled(store.disabled)
                    Button(store.text("savePreferences")) { store.send("savePreferences") }.disabled(!store.state.preferencesLoaded || store.disabled)
                }
            }
            messages
        }.formStyle(.grouped)
    }
    private var messages: some View {
        ClientMessages(error: store.error, note: store.state.note, pending: store.state.pending, pendingLabel: store.text("pending"))
    }
}
