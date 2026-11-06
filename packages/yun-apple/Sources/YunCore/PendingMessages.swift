import Foundation
import CryptoKit

public struct PendingMessage: Codable, Sendable, Equatable {
    public let sessionId: String
    public let text: String
    public let requestId: String
    public let createdAt: Date
    public init(sessionId: String, text: String, requestId: String = UUID().uuidString) {
        self.sessionId = sessionId; self.text = text; self.requestId = requestId; self.createdAt = Date()
    }
}

/// Only unconfirmed outgoing text is retained; the service owns canonical history.
public actor PendingMessages {
    private let directory: URL
    public init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Yun/PendingMessages", isDirectory: true)
    }
    private func file(origin: String, sessionId: String) -> URL {
        // Identifiers never become paths; origin and session are verified again after decoding.
        let key = SHA256.hash(data: Data((origin + "\n" + sessionId).utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(key + ".json")
    }
    public func load(origin: String, sessionId: String) throws -> PendingMessage? {
        let url = file(origin: origin, sessionId: sessionId)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        guard data.count <= 32_768 else { throw CompanionError.invalidResponse }
        let value = try JSONDecoder().decode(PendingMessage.self, from: data)
        guard value.sessionId == sessionId, value.text.utf16.count <= 4000 else { throw CompanionError.invalidResponse }
        return value
    }
    public func save(_ value: PendingMessage, origin: String) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let data = try JSONEncoder().encode(value)
        let url = file(origin: origin, sessionId: value.sessionId)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    public func remove(origin: String, sessionId: String) throws {
        let url = file(origin: origin, sessionId: sessionId)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }
}
