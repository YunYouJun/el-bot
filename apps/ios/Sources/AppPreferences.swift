import Foundation
import Observation
import YunCore

@MainActor @Observable final class AppPreferences {
    var language: String {
        didSet { defaults.set(language, forKey: "yun.locale") }
    }
    @ObservationIgnored private let defaults: UserDefaults
    var strings: YunStrings { YunStrings(preference: language) }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        language = defaults.string(forKey: "yun.locale") ?? ""
    }
}
