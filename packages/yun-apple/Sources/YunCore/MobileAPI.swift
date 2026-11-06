import Foundation

public actor MobileAPI {
    public nonisolated let endpoint: Endpoint
    private var token: String?
    private let session: URLSession

    public init(endpoint: Endpoint, token: String? = nil, session: URLSession? = nil) {
        self.endpoint = endpoint
        self.token = token
        self.session = session ?? Self.privateSession()
    }

    private struct PairRequest: Encodable { let code: String; let deviceName: String }
    private struct SessionList: Decodable, Sendable { let items: [SessionSummary] }
    private struct CreateRequest: Encodable { let requestId: String }
    private struct CreatedSession: Decodable, Sendable { let sessionId: String }
    private struct Prompt: Encodable { let text: String; let requestId: String }
    private struct SelectModel: Encodable {
        let provider: String
        let model: String
        let reasoningEffort: String?
    }
    private struct SelectedModel: Decodable, Sendable { let selected: ModelRoute }
    private struct Accepted: Decodable, Sendable { let accepted: Bool }
    private struct OK: Decodable, Sendable { let ok: Bool }
    private struct ServerError: Decodable { let error: String }
    private struct AccountPreferencesBody: Encodable { let language: String }

    public func pair(code: String, deviceName: String) async throws -> PairingResult {
        let body = try JSONEncoder().encode(PairRequest(code: PairingCode.normalize(code), deviceName: deviceName))
        let value: PairingResult = try await request("POST", path: ["pair"], body: body)
        guard value.token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              value.device.expiresAt > Date() else { throw CompanionError.invalidResponse }
        token = value.token
        return value
    }

    public func accountInstances(proof: AccountIdentityProof, deviceName: String) async throws -> [AccountInstance] {
        let body = try JSONEncoder().encode(AccountInstancesBody(proof: proof, deviceName: deviceName))
        let value: AccountDiscoveryResult = try await request("POST", path: ["account", "instances"], body: body)
        return value.instances.filter { instance in
            guard let endpoint = try? Endpoint(instance.publicOrigin),
                  instance.state == "online",
                  instance.entitlement == "owner",
                  instance.lastSeen <= Date(),
                  !instance.capabilities.isEmpty else { return false }
            return endpoint.absoluteString == instance.publicOrigin
        }
    }

    public func enroll(
        proof: AccountIdentityProof,
        instance: AccountInstance,
        deviceName: String
    ) async throws -> PairingResult {
        guard let ticket = instance.enrollmentTicket,
              let endpoint = try? Endpoint(instance.publicOrigin) else { throw CompanionError.invalidResponse }
        let api = MobileAPI(endpoint: endpoint, session: session)
        let body = try JSONEncoder().encode(AccountEnrollmentBody(proof: proof, ticket: ticket, instanceId: instance.id, deviceName: deviceName))
        let value: PairingResult = try await api.request("POST", path: ["pair"], body: body)
        guard value.token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              value.device.expiresAt > Date() else { throw CompanionError.invalidResponse }
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

    public func models(for id: String) async throws -> SessionModelCatalog {
        try await request("GET", path: ["sessions", id, "models"])
    }

    public func selectModel(_ route: ModelRoute, in id: String) async throws -> ModelRoute {
        let body = try JSONEncoder().encode(SelectModel(
            provider: route.provider,
            model: route.model,
            reasoningEffort: route.reasoningEffort
        ))
        let value: SelectedModel = try await request("PUT", path: ["sessions", id, "model"], body: body)
        return value.selected
    }

    public func send(_ text: String, to id: String, requestId: String) async throws {
        let body = try JSONEncoder().encode(Prompt(text: text, requestId: requestId))
        let value: Accepted = try await request("POST", path: ["sessions", id, "messages"], body: body)
        guard value.accepted else { throw CompanionError.invalidResponse }
    }

    public func botStatus() async throws -> BotStatus {
        try await request("GET", path: ["status"])
    }

    public func accountSyncState() async throws -> AccountSyncState {
        try await request("GET", path: ["account"])
    }

    public func linkAccount(proof: AccountIdentityProof, preferences: AccountPreferences) async throws -> AccountLinkResult {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let body = try encoder.encode(LinkAccountBody(proof: proof, preferences: preferences))
        return try await request("POST", path: ["account", "link"], body: body)
    }

    public func saveAccountPreferences(_ value: AccountPreferences) async throws -> AccountPreferences {
        let body = try JSONEncoder().encode(AccountPreferencesBody(language: value.language))
        return try await request("PUT", path: ["account", "preferences"], body: body)
    }

    public func unlinkAccount() async throws {
        let _: OK = try await request("DELETE", path: ["account"])
    }

    public func revoke() async throws {
        let _: OK = try await request("DELETE", path: ["device"])
        token = nil
    }

    fileprivate func request<Value: Decodable & Sendable>(
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
        let (bytes, response) = try await session.bytes(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw CompanionError.invalidResponse
        }
        var data = Data()
        for try await byte in bytes {
            // A page can carry eighty 16K-character messages, including JSON escapes.
            guard data.count < 8 * 1024 * 1024 else { throw CompanionError.invalidResponse }
            data.append(byte)
        }
        if response.statusCode == 429 { throw CompanionError.rateLimited }
        if response.statusCode == 401 {
            if path == ["pair"] { throw CompanionError.invalidPairing }
            if path.first == "account" { throw AccountSSOError.unauthorized }
            throw CompanionError.unauthorized
        }
        if response.statusCode == 503, path.first == "account" || path == ["pair"] { throw AccountSSOError.notConfigured }
        if response.statusCode == 403, path.first == "account" { throw AccountSSOError.invalidResponse }
        if response.statusCode == 400, path.first == "account" || path == ["pair"] { throw AccountSSOError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            if let error = try? JSONDecoder().decode(ServerError.self, from: data) {
                throw CompanionError.rejected(error.error)
            }
            throw CompanionError.unavailable
        }
        do { return try MobileJSON.decoder().decode(Value.self, from: data) }
        catch { throw CompanionError.invalidResponse }
    }

    private static func privateSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration, delegate: SameOriginTransport(), delegateQueue: nil)
    }
}

private struct LinkAccountBody: Encodable {
    let accessToken: String
    let identityAssertion: String
    let nonce: String
    let preferences: AccountPreferences

    init(proof: AccountIdentityProof, preferences: AccountPreferences) {
        accessToken = proof.accessToken
        identityAssertion = proof.identityAssertion
        nonce = proof.nonce
        self.preferences = preferences
    }
}

private struct AccountInstancesBody: Encodable {
    let accessToken: String
    let identityAssertion: String
    let nonce: String
    let deviceName: String

    init(proof: AccountIdentityProof, deviceName: String) {
        accessToken = proof.accessToken
        identityAssertion = proof.identityAssertion
        nonce = proof.nonce
        self.deviceName = deviceName
    }
}

private struct AccountEnrollmentBody: Encodable {
    let accessToken: String
    let identityAssertion: String
    let nonce: String
    let ticket: String
    let instanceId: String
    let deviceName: String

    init(proof: AccountIdentityProof, ticket: String, instanceId: String, deviceName: String) {
        accessToken = proof.accessToken
        identityAssertion = proof.identityAssertion
        nonce = proof.nonce
        self.ticket = ticket
        self.instanceId = instanceId
        self.deviceName = deviceName
    }
}

/// A paired credential is never carried through redirects or a shared browser cookie jar.
private final class SameOriginTransport: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
