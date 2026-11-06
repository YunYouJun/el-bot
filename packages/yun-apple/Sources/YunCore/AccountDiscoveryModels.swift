import Foundation

public struct AccountInstance: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let name: String
    public let publicOrigin: String
    public let state: String
    public let lastSeen: Date
    public let capabilities: [String]
    public let entitlement: String
    public let enrollmentTicket: String?

    public init(
        id: String,
        name: String,
        publicOrigin: String,
        state: String,
        lastSeen: Date,
        capabilities: [String],
        entitlement: String,
        enrollmentTicket: String? = nil
    ) {
        self.id = id
        self.name = name
        self.publicOrigin = publicOrigin
        self.state = state
        self.lastSeen = lastSeen
        self.capabilities = capabilities
        self.entitlement = entitlement
        self.enrollmentTicket = enrollmentTicket
    }
}

public struct AccountDiscoveryResult: Codable, Sendable, Equatable {
    public let instances: [AccountInstance]

    public init(instances: [AccountInstance]) {
        self.instances = instances
    }
}

public struct AccountDiscoveryState: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let canEnroll: Bool

    public init(enabled: Bool = false, canEnroll: Bool = false) {
        self.enabled = enabled
        self.canEnroll = canEnroll
    }
}
