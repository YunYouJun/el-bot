import SwiftUI
import YunUI
import YunCore

struct MobileSettings: View {
    @Environment(\.openModelSetupGuide) private var openModelSetupGuide
    @Bindable var preferences: AppPreferences
    let chat: ChatStore
    @Bindable var account: AccountSyncStore
    var body: some View {
        Form {
            Section {
                LanguagePicker(title: preferences.strings["language"], systemLabel: preferences.strings["followSystem"], selection: $preferences.language)
            }
            AccountSettingsSection(
                account: account,
                strings: preferences.strings,
                language: preferences.language,
                connect: { result, origin in try await chat.acceptEnrollment(result, origin: origin) }
            )
            Section { NavigationLink(preferences.strings["connect.title"]) { ChatConnectionView(store: chat) } }
            Section {
                Button { openModelSetupGuide?() } label: {
                    Label(preferences.strings["model.setup.title"], systemImage: "cpu")
                }
                .accessibilityIdentifier("modelSetupSettings")
            } footer: {
                Text(preferences.strings["model.setup.settings.detail"])
            }
            Section {
                NavigationLink { MobilePersonasView(chat: chat) } label: {
                    Label(preferences.strings["personas"], systemImage: "person.crop.rectangle")
                }
            }
        }
    }
}
