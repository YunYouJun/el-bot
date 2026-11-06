import Foundation

public enum PhoneApp: String, Codable, Sendable, CaseIterable {
    case chrome, safari, settings

    public var bundleID: String {
        switch self {
        case .chrome: "com.google.chrome.ios"
        case .safari: "com.apple.mobilesafari"
        case .settings: "com.apple.Preferences"
        }
    }
}

public struct PhoneChannel: Decodable, Sendable {
    public let channel: String
    public let sessionId: String
    public let apps: [PhoneApp]
    public let expiresAt: Date

    public func validate(now: Date = Date()) throws {
        guard channel.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              sessionId.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil,
              !apps.isEmpty, Set(apps).count == apps.count,
              expiresAt > now, expiresAt.timeIntervalSince(now) <= 605 else { throw CompanionError.invalidResponse }
    }
}

public struct PhoneCommand: Decodable, Sendable {
    public let id: String
    public let sessionId: String
    public let app: PhoneApp
    public let returnToYun: Bool
    public let expiresAt: Date

    public func validate(for channel: PhoneChannel, now: Date = Date()) throws {
        guard !id.isEmpty, id.utf8.count <= 512, sessionId == channel.sessionId,
              channel.apps.contains(app), channel.expiresAt > now,
              expiresAt > now, expiresAt <= channel.expiresAt,
              expiresAt.timeIntervalSince(now) <= 25 else { throw CompanionError.invalidResponse }
    }
}

public struct PhoneReceipt: Codable, Sendable {
    public enum Status: String, Codable, Sendable { case succeeded, failed, unknown }
    public let id: String
    public let status: Status
    public let launched: Bool
    public let returnedToYun: Bool

    public init(id: String, status: Status, launched: Bool, returnedToYun: Bool) {
        self.id = id; self.status = status; self.launched = launched; self.returnedToYun = returnedToYun
    }
}
