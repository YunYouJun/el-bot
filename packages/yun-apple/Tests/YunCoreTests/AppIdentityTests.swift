import Foundation
import XCTest
@testable import YunCore

final class AppIdentityTests: XCTestCase {
    func testMigratesOnlyMissingPreferencesAndPreservesLegacyDomain() throws {
        let prefix = "YunIdentityTests.\(UUID().uuidString)"
        let legacyIdentifier = "\(prefix).legacy"
        let identifier = "\(prefix).current"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: identifier))
        defer {
            defaults.removePersistentDomain(forName: legacyIdentifier)
            defaults.removePersistentDomain(forName: identifier)
        }
        let legacy = ["yun.chat.server": "https://legacy.example.test", "yun.locale": "zh-Hans", "unrelated": "private"]
        defaults.setPersistentDomain(legacy, forName: legacyIdentifier)
        defaults.setPersistentDomain(["yun.locale": "en", "current": "kept"], forName: identifier)

        YunAppIdentity.migratePreferences(in: defaults, from: legacyIdentifier, to: identifier)

        XCTAssertEqual(defaults.string(forKey: "yun.chat.server"), legacy["yun.chat.server"])
        XCTAssertEqual(defaults.string(forKey: "yun.locale"), "en")
        XCTAssertEqual(defaults.string(forKey: "current"), "kept")
        XCTAssertNil(defaults.string(forKey: "unrelated"))
        XCTAssertEqual(defaults.persistentDomain(forName: legacyIdentifier) as? [String: String], legacy)

        defaults.set("https://new.example.test", forKey: "yun.chat.server")
        YunAppIdentity.migratePreferences(in: defaults, from: legacyIdentifier, to: identifier)
        XCTAssertEqual(defaults.string(forKey: "yun.chat.server"), "https://new.example.test")
    }
}
