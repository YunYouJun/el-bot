import Foundation

public actor MobileAPI {
    public nonisolated let endpoint: Endpoint
    private var token: String?
    private let session: URLSession

    public init(endpoint: Endpoint, token: String? = nil, session: URLSession = .shared) {
        self.endpoint = endpoint
        self.token = token
        self.session = session
    }

    private struct PairRequest: Encodable { let code: String; let deviceName: String }
    private struct SessionList: Decodable, Sendable { let items: [SessionSummary] }
    private struct CreateRequest: Encodable { let requestId: String }
    private struct CreatedSession: Decodable, Sendable { let sessionId: String }
    private struct Prompt: Encodable { let text: String; let requestId: String }
    private struct Accepted: Decodable, Sendable { let accepted: Bool }
    private struct OK: Decodable, Sendable { let ok: Bool }
    private struct ServerError: Decodable { let error: String }

    public func pair(code: String, deviceName: String) async throws -> PairingResult {
        let body = try JSONEncoder().encode(PairRequest(code: PairingCode.normalize(code), deviceName: deviceName))
        let value: PairingResult = try await request("POST", path: ["pair"], body: body)
        token = value.token
        return value
    }

    public func currentDevice() async throws -> Device {
        try await request("GET", path: ["device"])
    }

    public func sessions() async throws -> [SessionSummary] {
        let value: SessionList = try await request("GET", path: ["sessions"])
        return value.items
    }

    public func create(requestId: String) async throws -> String {
        let body = try JSONEncoder().encode(CreateRequest(requestId: requestId))
        let value: CreatedSession = try await request("POST", path: ["sessions"], body: body)
        return value.sessionId
    }

    public func conversation(_ id: String, before: Int? = nil) async throws -> Conversation {
        try await request("GET", path: ["sessions", id], before: before)
    }

    public func send(_ text: String, to id: String, requestId: String) async throws {
        let body = try JSONEncoder().encode(Prompt(text: text, requestId: requestId))
        let value: Accepted = try await request("POST", path: ["sessions", id, "messages"], body: body)
        guard value.accepted else { throw CompanionError.invalidResponse }
    }

    public func botStatus() async throws -> BotStatus {
        try await request("GET", path: ["status"])
    }

    public func revoke() async throws {
        let _: OK = try await request("DELETE", path: ["device"])
        token = nil
    }

    private func request<Value: Decodable & Sendable>(
        _ method: String, path: [String], body: Data? = nil, before: Int? = nil
    ) async throws -> Value {
        var url = endpoint.origin.appending(path: "el-bot/mobile/v1")
        for part in path { url.appendPathComponent(part) }
        if let before { url.append(queryItems: [URLQueryItem(name: "before", value: String(before))]) }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, data.count <= 2 * 1024 * 1024 else {
            throw CompanionError.invalidResponse
        }
        if response.statusCode == 429 { throw CompanionError.rateLimited }
        if response.statusCode == 401 {
            if path == ["pair"] { throw CompanionError.invalidPairing }
            throw CompanionError.unauthorized
        }
        guard (200..<300).contains(response.statusCode) else {
            if let error = try? JSONDecoder().decode(ServerError.self, from: data) {
                throw CompanionError.rejected(error.error)
            }
            throw CompanionError.unavailable
        }
        do { return try MobileJSON.decoder().decode(Value.self, from: data) }
        catch { throw CompanionError.invalidResponse }
    }
}
