import Foundation

public enum PairingCode {
    public static func normalize(_ value: String) -> String {
        value.precomposedStringWithCompatibilityMapping.uppercased()
            .replacingOccurrences(of: "[\\s\\p{Pd}−]", with: "", options: .regularExpression)
    }
}

public struct Device: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let createdAt: Date
    public let expiresAt: Date
}

public struct PairingResult: Codable, Sendable {
    public let token: String
    public let device: Device
}

public enum SessionCategory: String, CaseIterable, Sendable {
    case all
    case qq
    case archived

    public var localizationKey: String { "sessions.category.\(rawValue)" }

    public func includes(_ session: SessionSummary) -> Bool {
        if self == .archived { return session.archived == true }
        return session.archived != true && (self == .all || session.source?.platform == rawValue)
    }
}

public struct SessionSummary: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public let title: String
    public let updatedAt: Date
    public let running: Bool
    public let blank: Bool?
    public let readOnly: Bool?
    public let archived: Bool?
    public let workspace: String?
    public let provider: String?
    public let model: String?
    public let source: SessionSource?
    public let context: SessionContext?
    public var displayTitle: String { source?.name ?? title }

    public init(
        id: String, title: String, updatedAt: Date, running: Bool,
        workspace: String?, provider: String?, model: String?, source: SessionSource? = nil,
        blank: Bool? = nil, archived: Bool? = nil, readOnly: Bool? = nil, context: SessionContext? = nil
    ) {
        self.id = id
        self.title = title
        self.updatedAt = updatedAt
        self.running = running
        self.blank = blank
        self.archived = archived
        self.readOnly = readOnly
        self.workspace = workspace
        self.provider = provider
        self.model = model
        self.source = source
        self.context = context
    }
}

public struct ModelRoute: Codable, Sendable, Hashable {
    public let provider: String
    public let model: String
    public let reasoningEffort: String?

    public init(provider: String, model: String, reasoningEffort: String? = nil) {
        self.provider = provider
        self.model = model
        self.reasoningEffort = reasoningEffort
    }
}

public struct ModelOption: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public let name: String
    public let description: String?
}

public struct ModelProviderGroup: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public let name: String
    public let models: [ModelOption]
}

public struct SessionModelCatalog: Codable, Sendable, Hashable {
    public let current: ModelRoute?
    public let groups: [ModelProviderGroup]

    public func displayName(for route: ModelRoute?) -> String? {
        guard let route else { return nil }
        for group in groups where group.id == route.provider {
            if let option = group.models.first(where: { $0.id == route.model }) {
                return option.name
            }
        }
        return nil
    }

    func selecting(_ route: ModelRoute) -> SessionModelCatalog {
        SessionModelCatalog(current: route, groups: groups)
    }
}

extension SessionSummary {
    var modelRoute: ModelRoute? {
        guard let provider, let model else { return nil }
        return ModelRoute(provider: provider, model: model)
    }

    func selecting(_ route: ModelRoute?) -> SessionSummary {
        SessionSummary(
            id: id,
            title: title,
            updatedAt: updatedAt,
            running: running,
            workspace: workspace,
            provider: route?.provider,
            model: route?.model,
            source: source,
            blank: blank,
            archived: archived,
            readOnly: readOnly,
            context: route?.provider == provider && route?.model == model ? context : nil
        )
    }
}

public struct ChatMessage: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public let role: String
    public let text: String
    public let createdAt: Date
    public let requestId: String?
}

public struct Conversation: Codable, Sendable {
    public let session: SessionSummary
    public let messages: [ChatMessage]
    public let hasMore: Bool
    public let cursor: Int
}

public struct BotStatus: Codable, Sendable {
    public let name: String
    public let appId: String
    public let state: String
    public let checkedAt: Date
    public let runtime: RemoteRuntimeStatus?
    public let host: RemoteHostStatus?
}

public struct RemoteHostStatus: Codable, Sendable {
    public let sampledAt: Date
    public let stale: Bool
    public let hostname: String
    public let cpu: HostCPUStatus
    public let memory: HostCapacityStatus
    public let disks: [HostDiskStatus]
}

public struct HostCPUStatus: Codable, Sendable {
    public let count: Int
    public let usagePercent: Double
    public let sampleSeconds: Double
}

public struct HostCapacityStatus: Codable, Sendable {
    public let totalBytes: Int64
    public let usedBytes: Int64
    public let availableBytes: Int64
    public let usagePercent: Double
}

public struct HostDiskStatus: Codable, Sendable {
    public let mountPoint: String
    public let totalBytes: Int64
    public let usedBytes: Int64
    public let availableBytes: Int64
    public let usagePercent: Double
}

public struct RemoteRuntimeStatus: Codable, Sendable {
    public let hostname: String
    public let platform: String
    public let release: String
    public let arch: String
    public let nodeVersion: String
    public let cpuCount: Int
    public let uptimeSeconds: Double
    public let memoryRSSBytes: Int64
}

public struct Endpoint: Sendable, Equatable {
    public let origin: URL

    public init(_ value: String) throws {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.contains(where: { $0.isWhitespace }),
              var components = URLComponents(string: value),
              components.scheme?.lowercased() == "https",
              let host = components.host, !host.isEmpty,
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.path.isEmpty || components.path == "/"
        else { throw CompanionError.invalidServer }
        components.scheme = "https"
        components.host = host.lowercased()
        components.path = ""
        guard let url = components.url else { throw CompanionError.invalidServer }
        origin = url
    }

    public var absoluteString: String { origin.absoluteString }
}

public enum CompanionError: Error, Sendable, Equatable {
    case invalidServer
    case unauthorized
    case invalidPairing
    case rateLimited
    case unavailable
    case invalidResponse
    case rejected(String)

    public var localizationKey: String {
        switch self {
        case .invalidServer: "error.server"
        case .unauthorized: "error.unauthorized"
        case .invalidPairing: "error.pairing"
        case .rateLimited: "error.rate_limit"
        case .unavailable: "error.unavailable"
        case .invalidResponse: "error.response"
        case .rejected(let code):
            switch code {
            case "session_active": "sessions.error.active"
            case "session_not_found": "sessions.error.deleted"
            case "invalid_text": "qq.error.text"
            case "not_found", "journal_unavailable", "invalid_qq_response": "qq.error.unavailable"
            case "platform_rejected": "qq.delivery.failed"
            case "qq_chat_unavailable": "qq.error.upgrade"
            case "still_pausing": "qq.error.pausing"
            case "preview_expired", "stale_session": "qq.error.preview"
            case "lease_expired": "qq.error.lease"
            case "reply_expired": "qq.error.reply"
            case "proactive_denied", "40034105": "qq.error.proactive"
            case "send_in_progress": "qq.error.sending"
            case "rate_limited": "error.rate_limit"
            case "session_historical": "sessions.historical"
            case "session_archived": "sessions.error.archived"
            case "confirmation_expired", "session_changed": "sessions.error.confirmation"
            case "session_owner_unavailable": "sessions.error.owner"
            case "session_management_unavailable", "session_deletion_unsupported", "groups_unavailable": "sessions.error.upgrade"
            case "restart_unavailable": "error.restart_unavailable"
            case "group_forbidden": "groups.error.forbidden"
            default: "error.rejected"
            }
        }
    }
}

public enum MobileJSON {
    public static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: value) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid server timestamp")
        }
        return decoder
    }
}
