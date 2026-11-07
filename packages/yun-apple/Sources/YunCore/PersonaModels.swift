import Foundation

public struct PersonaMetadata: Decodable, Sendable, Equatable {
    public let id: String
    public let name: String
    public let description: String?
    public let author: String?
    public let version: String?
    public let license: String?
    public let homepage: String?
}

public struct PersonaSource: Decodable, Sendable, Equatable {
    public let kind: String
    public let name: String?
    public let path: String?
    public let url: String?
    public let repository: String?
    public let ref: String?
    public let commit: String?

    public var canCheckUpdates: Bool { kind == "url" || kind == "git" }
    public var summary: String {
        switch kind {
        case "git": [repository, path, ref, commit.map { String($0.prefix(8)) }].compactMap { $0 }.joined(separator: " · ")
        case "url": url ?? ""
        case "file": path.map { URL(fileURLWithPath: $0).lastPathComponent } ?? ""
        default: name ?? ""
        }
    }
}

public struct PersonaRevision: Decodable, Sendable, Equatable, Identifiable {
    public let hash: String
    public let metadata: PersonaMetadata
    public let source: PersonaSource
    public let importedAt: Date
    public var id: String { hash }
}

public struct PersonaCard: Decodable, Sendable, Equatable, Identifiable {
    public let hash: String
    public let metadata: PersonaMetadata
    public let source: PersonaSource
    public let revisions: [PersonaRevision]
    public var id: String { metadata.id }
}

public struct PersonaSelection: Decodable, Sendable, Equatable {
    public let id: String
    public let hash: String
}

public struct PersonaLibrary: Decodable, Sendable, Equatable {
    public let version: Int
    public let cards: [PersonaCard]
    public let active: PersonaSelection?

    public var activeRevision: PersonaRevision? {
        guard let active else { return nil }
        return cards.first { $0.id == active.id }?.revisions.first { $0.hash == active.hash }
    }
}

public struct PersonaPreview: Decodable, Sendable, Equatable {
    public let hash: String
    public let metadata: PersonaMetadata
    public let source: PersonaSource
    public let body: String
}

public struct PersonaResponse: Decodable, Sendable {
    public struct Instance: Decodable, Sendable { public let title: String }
    public let library: PersonaLibrary
    public let preview: PersonaPreview?
    public let instance: Instance
}

/// Native imports never send a server filesystem path.
public struct PersonaImport: Encodable, Sendable {
    public let kind: String
    private let name: String?
    private let text: String?
    private let url: String?
    private let repository: String?
    private let path: String?
    private let ref: String?

    private init(kind: String, name: String? = nil, text: String? = nil, url: String? = nil,
                 repository: String? = nil, path: String? = nil, ref: String? = nil) {
        self.kind = kind; self.name = name; self.text = text; self.url = url
        self.repository = repository; self.path = path; self.ref = ref
    }

    public static func file(name: String, data: Data) throws -> Self {
        guard data.count <= 32 * 1024 else { throw CompanionError.rejected("persona_too_large") }
        guard let text = String(data: data, encoding: .utf8), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw CompanionError.rejected("invalid_persona_file")
        }
        return Self(kind: "text", name: name, text: text)
    }

    public static func link(_ url: String) -> Self { Self(kind: "url", url: url) }
    public static func git(repository: String, path: String, ref: String) -> Self {
        Self(kind: "git", repository: repository, path: path, ref: ref)
    }
}

public struct PersonaRequest: Encodable, Sendable {
    public enum Operation: String, Encodable, Sendable { case list, preview, `import`, use, disable, update }
    public let operation: Operation
    public let id: String?
    public let revision: String?
    public let input: PersonaImport?

    public init(_ operation: Operation, id: String? = nil, revision: String? = nil, input: PersonaImport? = nil) {
        self.operation = operation; self.id = id; self.revision = revision; self.input = input
    }
}
