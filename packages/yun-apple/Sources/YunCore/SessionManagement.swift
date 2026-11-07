import Foundation

public struct SessionOperation: Sendable {
    public enum Kind: String, Sendable {
        case archiving, restoring, preparingDeletion, deleting
    }
    public let sessionId: String
    public let kind: Kind
    public var localizationKey: String { "sessions.operation.\(kind.rawValue)" }
}

extension SessionSummary {
    func settingArchived(_ archived: Bool) -> Self {
        Self(id: id, title: title, updatedAt: updatedAt, running: running,
             workspace: workspace, provider: provider, model: model, source: source,
         blank: blank, archived: archived, readOnly: readOnly, context: context)
    }
}

public struct DeletionConfirmation: Codable, Sendable {
    public let confirmation: String
    public let expiresAt: Date
}

public struct BotGroup: Codable, Identifiable, Sendable, Hashable {
    public let id: String
    public let source: SessionSource
    public let membership: String
    public let allowed: Bool
    public let sessionId: String?
    public var canOpen: Bool { allowed && membership != "left" }
    public var displayTitle: String { source.name ?? "QQ · " + String(id.prefix(8)) }
}
