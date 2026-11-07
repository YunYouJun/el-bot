import Foundation

public struct SessionContext: Codable, Sendable, Hashable {
    public let usedTokens: Double?
    public let contextWindow: Double?
    public let usageSource: String?
    public let policy: SessionContextPolicy?

    public var occupancy: Double? {
        guard let usedTokens, let contextWindow,
              usedTokens.isFinite, usedTokens >= 0, contextWindow.isFinite, contextWindow > 0 else { return nil }
        return usedTokens / contextWindow
    }
}

public struct SessionContextPolicy: Codable, Sendable, Hashable {
    public let automatic: Bool
    public let thresholdRatio: Double
    public let headroomTokens: Double
    public let retainRatio: Double?
    public let retainTokens: Double?
    public let source: String
    public let preset: String?
}
