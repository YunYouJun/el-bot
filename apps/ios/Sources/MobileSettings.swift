import SwiftUI
import YunUI
import YunCore

struct MobileSettings: View {
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
        }
    }
}
