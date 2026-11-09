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
    private struct RestartRequest: Encodable { let force: Bool }
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

    public func reminderNotifications() async throws -> ReminderNotificationStatus {
        try await request("GET", path: ["notifications"])
    }

    public func registerReminderNotifications(token: Data, environment: String) async throws -> ReminderNotificationStatus {
        let registration = ReminderNotificationRegistration(token: token, environment: environment)
        return try await request("PUT", path: ["notifications"], body: JSONEncoder().encode(registration))
    }

    @discardableResult
    public func unregisterReminderNotifications() async throws -> ReminderNotificationStatus {
        try await request("DELETE", path: ["notifications"])
    }

    public func openPhoneChannel(requestId: String, apps: [PhoneApp]) async throws -> PhoneChannel {
        struct Body: Encodable { let requestId: String; let apps: [PhoneApp] }
        let value: PhoneChannel = try await request("POST", path: ["phone", "channel"], body: JSONEncoder().encode(Body(requestId: requestId, apps: apps)))
        try value.validate()
        guard value.apps == apps else { throw CompanionError.invalidResponse }
        return value
    }

    public func nextPhoneCommand(_ channel: PhoneChannel) async throws -> PhoneCommand? {
        struct Poll: Decodable, Sendable { let command: PhoneCommand? }
        let value: Poll = try await request("GET", path: ["phone", "next"], phoneChannel: channel.channel)
        if let command = value.command { try command.validate(for: channel) }
        return value.command
    }

    public func completePhoneCommand(_ receipt: PhoneReceipt, channel: PhoneChannel) async throws {
        let _: OK = try await request("POST", path: ["phone", "results"], body: JSONEncoder().encode(receipt), phoneChannel: channel.channel)
    }

    public func closePhoneChannel(_ channel: PhoneChannel) async throws {
        let _: OK = try await request("DELETE", path: ["phone", "channel"], phoneChannel: channel.channel)
    }

    public func webLaunch() async throws -> DSHWebLaunch {
        let body = try JSONEncoder().encode(["access": "owner-web"])
        return try await request("POST", path: ["web", "ticket"], body: body)
    }

    public func webCookie() async throws -> HTTPCookie {
        let launch = try await webLaunch()
        let (bytes, response) = try await session.bytes(for: launch.request(for: endpoint))
        var count = 0
        for try await _ in bytes {
            count += 1
            guard count <= 4096 else { throw CompanionError.invalidResponse }
        }
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse else { throw CompanionError.invalidResponse }
        return try DSHWebLaunch.cookie(from: response, for: endpoint)
    }

    public func sessions() async throws -> [SessionSummary] {
        let value: SessionList = try await request("GET", path: ["sessions"])
        return value.items
    }

    public func groupChat(_ id: String, before: Int? = nil) async throws -> GroupChatState {
        try await request("GET", path: ["sessions", id, "qq"], before: before)
    }

    public func groupChat(_ id: String, request operation: GroupChatRequest) async throws -> GroupChatResponse {
        try await request("POST", path: ["sessions", id, "qq"], body: JSONEncoder().encode(operation))
    }

    public func groupMember(_ id: String, senderId: String) async throws -> GroupMemberProfile {
        try await request("GET", path: ["sessions", id, "qq", "members", senderId])
    }

    public func archive(_ id: String, archived: Bool) async throws {
        let _: OK = try await request("PUT", path: ["sessions", id, "archive"], body: JSONEncoder().encode(["archived": archived]))
    }

    public func prepareDeletion(_ id: String) async throws -> DeletionConfirmation {
        try await request("POST", path: ["sessions", id, "deletion"])
    }

    public func delete(_ id: String, confirmation: String) async throws {
        let _: OK = try await request("DELETE", path: ["sessions", id], body: JSONEncoder().encode(["confirmation": confirmation]))
    }

    public func groups() async throws -> [BotGroup] {
        struct Groups: Decodable, Sendable { let items: [BotGroup] }
        let value: Groups = try await request("GET", path: ["groups"])
        return value.items
    }

    public func openGroup(_ id: String) async throws -> String {
        let value: CreatedSession = try await request("POST", path: ["groups", id, "conversation"])
        return value.sessionId
    }

    public func create(requestId: String) async throws -> String {
        let body = try JSONEncoder().encode(CreateRequest(requestId: requestId))
        let value: CreatedSession = try await request("POST", path: ["sessions"], body: body)
        return value.sessionId
    }

    public func conversation(_ id: String, before: Int? = nil) async throws -> Conversation {
        try await request("GET", path: ["sessions", id], before: before)
    }

    public func sessionInformation(_ id: String) async throws -> SessionSummary {
        try await request("GET", path: ["sessions", id, "info"])
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

    public func restart(force: Bool) async throws {
        let value: OK = try await request(
            "POST",
            path: ["system", "restart"],
            body: JSONEncoder().encode(RestartRequest(force: force))
        )
        guard value.ok else { throw CompanionError.invalidResponse }
    }

    public func personas(_ operation: PersonaRequest = PersonaRequest(.list)) async throws -> PersonaResponse {
        let value: PersonaResponse = try await request("POST", path: ["personas"], body: JSONEncoder().encode(operation))
        guard value.library.version == 1 else { throw CompanionError.invalidResponse }
        return value
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
        _ method: String, path: [String], body: Data? = nil, before: Int? = nil, phoneChannel: String? = nil
    ) async throws -> Value {
        var url = endpoint.origin.appending(path: "el-bot/mobile/v1")
        for part in path { url.appendPathComponent(part) }
        if let before { url.append(queryItems: [URLQueryItem(name: "before", value: String(before))]) }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let phoneChannel { request.setValue(phoneChannel, forHTTPHeaderField: "X-Yun-Phone-Channel") }
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
