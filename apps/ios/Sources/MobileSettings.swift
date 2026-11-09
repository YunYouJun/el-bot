import SwiftUI
import YunUI
import YunCore

struct MobileSettings: View {
    @Environment(\.openModelSetupGuide) private var openModelSetupGuide
    @Bindable var preferences: AppPreferences
    let chat: ChatStore
    @Bindable var account: AccountSyncStore
    @Bindable var yunleAccount: YunleAccountStore
    var body: some View {
        Form {
            Section {
                NavigationLink {
                    Form {
                        YunleAccountSection(store: yunleAccount, strings: preferences.strings)
                        if account.canLink || account.state.linked {
                            AccountSettingsSection(
                                account: account,
                                strings: preferences.strings,
                                language: preferences.language,
                                connect: { result, origin in try await chat.acceptEnrollment(result, origin: origin) }
                            )
                        }
                    }
                    .navigationTitle(preferences.strings["settings.accounts"])
                    .navigationBarTitleDisplayMode(.inline)
                } label: {
                    Label(preferences.strings["settings.accounts"], systemImage: "person.crop.circle")
                }
                .accessibilityIdentifier("accountSettings")
            }
            Section(preferences.strings["settings.general"]) {
                LanguagePicker(title: preferences.strings["language"], systemLabel: preferences.strings["followSystem"], selection: $preferences.language)
                if chat.device != nil {
                    NavigationLink { ReminderNotificationSettings() } label: {
                        Label(preferences.strings["notifications.title"], systemImage: "bell.badge")
                    }
                    .accessibilityIdentifier("reminderNotificationSettings")
                }
            }
            Section(preferences.strings["settings.bot"]) {
                NavigationLink { ChatConnectionView(store: chat).navigationTitle(preferences.strings["connect.title"]) } label: {
                    Label(preferences.strings["connect.title"], systemImage: "network")
                }
                NavigationLink { MobilePersonasView(chat: chat) } label: {
                    Label(preferences.strings["personas"], systemImage: "person.crop.rectangle")
                }
                Button { openModelSetupGuide?() } label: {
                    Label(preferences.strings["model.setup.title"], systemImage: "cpu")
                }
                .accessibilityIdentifier("modelSetupSettings")
            }
        }
    }
}
