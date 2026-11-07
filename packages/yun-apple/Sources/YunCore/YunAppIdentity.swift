import Foundation

public enum YunAppIdentity {
    public static let bundleIdentifier = "fun.yunle.bot"
    public static let legacyBundleIdentifier = "cn.elpsy.elbot.client"

    public static func migrateDesktopPreferences() {
        #if os(macOS)
        guard Bundle.main.bundleIdentifier == bundleIdentifier else { return }
        migratePreferences(in: .standard, from: legacyBundleIdentifier, to: bundleIdentifier)
        #endif
    }

    static func migratePreferences(in defaults: UserDefaults, from legacyIdentifier: String, to identifier: String) {
        guard let legacy = defaults.persistentDomain(forName: legacyIdentifier) else { return }
        var current = defaults.persistentDomain(forName: identifier) ?? [:]
        for key in ["yun.chat.server", "yun.locale"] where current[key] == nil {
            if let value = legacy[key] as? String { current[key] = value }
        }
        defaults.setPersistentDomain(current, forName: identifier)
    }
}
