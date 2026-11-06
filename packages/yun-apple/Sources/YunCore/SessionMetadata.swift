import Foundation

public struct SessionSource: Codable, Sendable, Hashable {
    public let platform: String
    public let kind: String?
    public let appId: String?
    public let peerId: String?
    public let name: String?
    public let description: String?
    public let category: String?
    public let tags: [String]?
    public let memberCount: Int?
    public let groupInfoStatus: String?
    public let botStateStatus: String?
    public let bot: SessionBotMetadata?
    public let lastMessage: SessionInboundMessage?

    public init(
        platform: String, kind: String? = nil, appId: String? = nil, peerId: String? = nil,
        name: String? = nil, description: String? = nil, category: String? = nil,
        tags: [String]? = nil, memberCount: Int? = nil, groupInfoStatus: String? = nil,
        botStateStatus: String? = nil, bot: SessionBotMetadata? = nil, lastMessage: SessionInboundMessage? = nil
    ) {
        self.platform = platform
        self.kind = kind
        self.appId = appId
        self.peerId = peerId
        self.name = name
        self.description = description
        self.category = category
        self.tags = tags
        self.memberCount = memberCount
        self.groupInfoStatus = groupInfoStatus
        self.botStateStatus = botStateStatus
        self.bot = bot
        self.lastMessage = lastMessage
    }
}

public struct SessionBotMetadata: Codable, Sendable, Hashable {
    public let joinedAt: Date?
    public let role: String?
    public let receiveMode: String?
    public let allowProactive: Bool?
}

public struct SessionInboundMessage: Codable, Sendable, Hashable {
    public let id: String
    public let senderId: String
    public let senderName: String?
    public let senderRole: String?
    public let senderIsBot: Bool?
    public let text: String
    public let createdAt: Date
    public let type: String
}
