import Foundation

public struct YunStrings: Sendable {
    public let locale: String
    private let values: [String: String]

    public init(preference: String = "", systemLanguage: String = Locale.preferredLanguages.first ?? "en") {
        locale = (preference.isEmpty ? systemLanguage : preference).hasPrefix("zh") ? "zh-Hans" : "en"
        let url = Bundle.module.url(forResource: locale, withExtension: "json")!
        values = (try? JSONDecoder().decode([String: String].self, from: Data(contentsOf: url))) ?? [:]
    }

    public subscript(_ key: String) -> String { values[key] ?? key }
}
