import Foundation

public struct ReminderNotificationStatus: Decodable, Sendable {
    public struct Receipt: Decodable, Sendable {
        public let status: String
        public let at: Date
        public let code: String?
    }
    public let configured: Bool
    public let registered: Bool
    public let lastReceipt: Receipt?
}

public struct ReminderNotificationRegistration: Encodable, Sendable {
    public let token: String
    public let environment: String
    public init(token: Data, environment: String) {
        self.token = token.map { String(format: "%02x", $0) }.joined()
        self.environment = environment
    }
}
