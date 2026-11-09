import SwiftUI
import YunCore
import YunUI

@main struct YunIOSApp: App {
    @UIApplicationDelegateAdaptor(ReminderNotificationDelegate.self) private var notifications
    @State private var preferences = AppPreferences()
    @State private var chat = ChatStore()
    @State private var yunleAccount = YunleAccountStore()
    @State private var account: AccountSyncStore

    init() {
        let store = ChatStore()
        let accountStore = AccountSyncStore(client: { store.client })
        _chat = State(initialValue: store)
        _account = State(initialValue: accountStore)
    }

    var body: some Scene {
        WindowGroup {
            MobileRoot(preferences: preferences, chat: chat, account: account, yunleAccount: yunleAccount)
                .environment(\.locale, Locale(identifier: preferences.strings.locale))
                .environment(\.yunStrings, preferences.strings)
                .task { await chat.restore() }
                .task { await yunleAccount.restore() }
                .task {
                    account.onPreferences = { value in preferences.language = value.language }
                    account.onConnected = { result, origin in try await chat.acceptEnrollment(result, origin: origin) }
                }
        }
    }
}
