import Foundation

public enum ClientPage: String, Codable, Sendable, CaseIterable {
    case quickActions, personas, settings
}

public struct ClientChoice: Codable, Sendable, Identifiable {
    public var value: String
    public var name: String
    public var id: String { value }
}

public struct ClientLanguage: Codable, Sendable, Identifiable {
    public var tag: String
    public var name: String
    public var id: String { tag }
}

public struct ClientProgram: Codable, Sendable, Identifiable {
    public var name: String
    public var title: String
    public var action: String
    public var bundleIdentifier: String
    public var path: String
    public var id: String { name }
}

public struct ReplyPreferences: Codable, Sendable {
    public var messageFormat = "markdown"
    public var imageTheme = "light"
}

/// The same bounded JSON contract is used by the Go controller and Apple clients.
public struct ClientSnapshot: Codable, Sendable {
    public var confirmation = ""
    public var busy = false
    public var page = ClientPage.quickActions
    public var locale = "en"
    public var localePreference = ""
    public var languages: [ClientLanguage] = []
    public var strings: [String: String] = [:]
    public var draft: [String: String] = [:]
    public var programs: [ClientProgram] = []
    public var host = ""
    public var pending = false
    public var localExpanded = false
    public var error = ""
    public var note = ""
    public var phase = ""
    public var qq = ""
    public var agent = "Codex"
    public var agentConnection = ""
    public var task = ""
    public var phaseKey = ""
    public var preferences = ReplyPreferences()
    public var preferencesLoaded = false
    public var logs = ""
    public var personaLoaded = false
    public var personaName = ""
    public var personaDescription = ""
    public var personaSelection = "default"
    public var personaChoices: [ClientChoice] = []

    public init() {}
    public func text(_ key: String) -> String { strings[key] ?? key }
}

public struct ClientEvent: Encodable, Sendable {
    public let action: String
    public let value: String
    public let field: String

    public init(_ action: String, _ value: String = "", field: String = "") {
        self.action = action
        self.value = value
        self.field = field
    }

    public func encodedLine() throws -> Data {
        var data = try JSONEncoder().encode(self)
        guard data.count <= 16_384, !value.contains("\0") else { throw ProtocolError.eventTooLarge }
        data.append(10)
        return data
    }
}

public enum ProtocolError: Error, Sendable, Equatable {
    case frameTooLarge, incompleteFrame, eventTooLarge
}

/// Accepts fragmented reads without allowing an unbounded or unterminated frame.
public struct SnapshotFramer: Sendable {
    public static let maximumFrameBytes = 2 * 1024 * 1024
    private var buffer = Data()
    public init() {}

    public mutating func append(_ chunk: Data) throws -> [Data] {
        var frames: [Data] = []
        var start = chunk.startIndex
        for end in chunk.indices where chunk[end] == 10 {
            try accumulate(chunk[start..<end])
            frames.append(buffer)
            buffer = Data()
            start = chunk.index(after: end)
        }
        try accumulate(chunk[start...])
        return frames
    }

    private mutating func accumulate(_ data: Data.SubSequence) throws {
        guard buffer.count + data.count <= Self.maximumFrameBytes else {
            buffer.removeAll()
            throw ProtocolError.frameTooLarge
        }
        buffer.append(contentsOf: data)
    }

    public func finish() throws {
        guard buffer.isEmpty else { throw ProtocolError.incompleteFrame }
    }
}
