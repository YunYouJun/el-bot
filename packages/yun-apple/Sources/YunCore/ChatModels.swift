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

    public var localizationKey: String { "sessions.category.\(rawValue)" }

    public func includes(_ session: SessionSummary) -> Bool {
        self == .all || session.source?.platform == rawValue
    }
}

public struct SessionSummary: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public let title: String
    public let updatedAt: Date
    public let running: Bool
    public let workspace: String?
    public let provider: String?
    public let model: String?
    public let source: SessionSource?
    public var displayTitle: String { source?.name ?? title }

    public init(
        id: String, title: String, updatedAt: Date, running: Bool,
        workspace: String?, provider: String?, model: String?, source: SessionSource? = nil
    ) {
        self.id = id
        self.title = title
        self.updatedAt = updatedAt
        self.running = running
        self.workspace = workspace
        self.provider = provider
        self.model = model
        self.source = source
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
            source: source
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
        case .rejected: "error.rejected"
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
