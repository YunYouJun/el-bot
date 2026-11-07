import CryptoKit
import Foundation
import Testing
@testable import YunCore

private actor AccountMemoryVault: YunleCredentialStorage {
    var data: Data?
    func load() -> Data? { data }
    func save(_ data: Data) { self.data = data }
    func remove() { data = nil }
}
private actor AccountTestTransport: YunleAccountTransport {
    let signer: Curve25519.Signing.PrivateKey
    var publicJWK: [String: String]?
    var calls: [String] = []
    var expireSoon = false
    var loseRefresh = false
    var revokeFails = false
    var refreshCount = 0
    var holdPoll = false
    var pollSuspended = false
    var resumePoll: CheckedContinuation<Void, Never>?
    func pausePoll() { holdPoll = true }
    func releasePoll() { resumePoll?.resume(); resumePoll = nil }
    init(signer: Curve25519.Signing.PrivateKey) { self.signer = signer }
    func configure(expireSoon: Bool = false, loseRefresh: Bool = false, revokeFails: Bool = false) {
        self.expireSoon = expireSoon; self.loseRefresh = loseRefresh; self.revokeFails = revokeFails
    }
    func send(_ request: URLRequest) async throws -> Data {
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        let proof = request.value(forHTTPHeaderField: "DPoP")!.split(separator: ".").map(String.init)
        let header = try JSONSerialization.jsonObject(with: Data(yunleBase64URL: proof[0])!) as! [String: Any]
        let jwk = header["jwk"] as! [String: String]
        let claims = try JSONSerialization.jsonObject(with: Data(yunleBase64URL: proof[1])!) as! [String: Any]
        let x = Data(yunleBase64URL: jwk["x"]!)!, y = Data(yunleBase64URL: jwk["y"]!)!
        let key = try P256.Signing.PublicKey(x963Representation: Data([4]) + x + y)
        let signature = try P256.Signing.ECDSASignature(rawRepresentation: Data(yunleBase64URL: proof[2])!)
        #expect(key.isValidSignature(signature, for: Data("\(proof[0]).\(proof[1])".utf8)))
        #expect(claims["htu"] as? String == request.url!.absoluteString)
        #expect(claims["htm"] as? String == "POST")
        if let raw = body["request"] as? String {
            let input = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as! [String: String]
            let token = request.value(forHTTPHeaderField: "Authorization")!.dropFirst(5)
            #expect(claims["ath"] as? String == Data(SHA256.hash(data: Data(token.utf8))).yunleBase64URL)
            #expect(claims["request_hash"] as? String == Data(SHA256.hash(data: Data(raw.utf8))).yunleBase64URL)
            calls.append(input["action"]!)
            if input["action"] == "account" {
                return try json(["userId": "user_1", "account": ["availableMicroPoints": 300000, "reservedMicroPoints": 0, "chargedMicroPoints": 125]])
            }
            return try json(["items": [["id": "tx-1", "taskId": "task-1", "type": "settle", "chargedMicroPoints": 125, "createdAt": 1700000000000, "model": "flash", "inputTokens": 10, "outputTokens": 5]], "nextCursor": "offset:50"])
        }
        let action = body["action"] as! String
        calls.append(action)
        switch action {
        case "startDeviceAuth":
            #expect(body["clientId"] as? String == "el-bot-ios")
            #expect(Set(body["scope"] as! [String]) == ["membership:read", "ai:usage"])
            publicJWK = body["devicePublicJwk"] as? [String: String]
            return try json(["ok": true, "data": ["deviceCode": "secret-code", "userCode": "ABCD-1234", "verificationUriComplete": "https://www.yunle.fun/link?code=ABCD-1234", "expiresIn": 600, "interval": 5]])
        case "pollDeviceToken", "refreshEntitlement":
            if action == "pollDeviceToken", holdPoll {
                pollSuspended = true
                await withCheckedContinuation { resumePoll = $0 }
            }
            if action == "refreshEntitlement" { refreshCount += 1; if loseRefresh { throw URLError(.timedOut) } }
            let key = publicJWK ?? jwk
            let canonical = try JSONSerialization.data(withJSONObject: key, options: [.sortedKeys, .withoutEscapingSlashes])
            let now = Int64(Date().timeIntervalSince1970)
            let token = try signedToken(signer, claims: ["iss": "https://www.yunle.fun", "aud": "el-bot-ios", "app_id": "el-bot", "sub": "user_1", "scope": ["membership:read", "ai:usage"], "grant_id": "grant-1", "jti": UUID().uuidString, "iat": now, "nbf": now, "exp": now + (expireSoon ? 30 : 3600), "cnf": ["jkt": Data(SHA256.hash(data: canonical)).yunleBase64URL]])
            return try json(["ok": true, "data": ["status": "approved", "entitlement": token, "deviceRefreshToken": "refresh-\(refreshCount)"]])
        case "revokeEntitlement":
            if revokeFails { throw URLError(.notConnectedToInternet) }
            return try json(["ok": true, "data": ["revoked": true]])
        default: throw YunleAccountError.invalidResponse
        }
    }
    private func json(_ value: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: value) }
}
private func signedToken(_ signer: Curve25519.Signing.PrivateKey, claims: [String: Any], algorithm: String = "EdDSA") throws -> String {
    let header = try JSONSerialization.data(withJSONObject: ["alg": algorithm, "typ": "ylf-entitlement+jwt", "kid": "test"]).yunleBase64URL
    let body = try JSONSerialization.data(withJSONObject: claims).yunleBase64URL
    let raw = "\(header).\(body)"
    return raw + "." + (try signer.signature(for: Data(raw.utf8))).yunleBase64URL
}
private func fixture() -> (YunleAccountClient, AccountTestTransport, AccountMemoryVault) {
    let signer = Curve25519.Signing.PrivateKey()
    let transport = AccountTestTransport(signer: signer), vault = AccountMemoryVault()
    return (YunleAccountClient(transport: transport, storage: vault, anchors: ["test": signer.publicKey.rawRepresentation]), transport, vault)
}
private func login(_ client: YunleAccountClient) async throws {
    _ = try await client.beginLogin()
    #expect(try await client.pollLogin() == "user_1")
}
@Test func yunleReadOnlyLoginPersistsAndBindsRequests() async throws {
    let (client, transport, vault) = fixture()
    #expect(try await client.restore() == nil)
    try await login(client)
    #expect(try await client.overview().account.availableMicroPoints == 300000)
    #expect(try await client.usage().items.first?.chargedMicroPoints == 125)
    #expect(await vault.data != nil)
    #expect(await transport.calls == ["startDeviceAuth", "pollDeviceToken", "account", "transactions"])
    try await client.logout()
    #expect(await vault.data == nil)
}
@Test func yunleLostRefreshNeverReplaysRotatingToken() async throws {
    let (client, transport, vault) = fixture()
    await transport.configure(expireSoon: true, loseRefresh: true)
    try await login(client)
    await #expect(throws: URLError.self) { _ = try await client.overview() }
    await #expect(throws: YunleAccountError.refreshUncertain) { _ = try await client.overview() }
    #expect(await transport.refreshCount == 1)
    let data = try #require(await vault.data)
    #expect(try JSONDecoder().decode(YunleAccountClient.Credentials.self, from: data).refreshPending)
    try await client.logout()
}
@Test func yunleLogoutDoesNotForgetCredentialsWithoutRevocation() async throws {
    let (client, transport, vault) = fixture()
    try await login(client)
    await transport.configure(revokeFails: true)
    await #expect(throws: URLError.self) { try await client.logout() }
    #expect(await vault.data != nil)
    #expect(try await client.overview().userId == "user_1")
}
@Test func yunleCancellingLoginNeverInstallsCredentials() async throws {
    let (client, _, vault) = fixture()
    _ = try await client.beginLogin()
    await client.cancelLogin()
    await #expect(throws: YunleAccountError.signInRequired) { _ = try await client.pollLogin() }
    #expect(await vault.data == nil)
}
@Test func yunleEntitlementRejectsCloudAudienceAndWrongInstallation() async throws {
    let (client, transport, vault) = fixture()
    try await login(client)
    let data = try #require(await vault.data)
    let saved = try JSONDecoder().decode(YunleAccountClient.Credentials.self, from: data)
    let key = try P256.Signing.PrivateKey(rawRepresentation: saved.key)
    let parts = saved.entitlement.split(separator: ".")
    let claimData = try #require(Data(yunleBase64URL: String(parts[1])))
    var claims = try #require(JSONSerialization.jsonObject(with: claimData) as? [String: Any])
    let signer = await transport.signer
    claims["aud"] = "el-bot-cloud"
    let wrongAudience = try signedToken(signer, claims: claims)
    await #expect(throws: YunleAccountError.invalidResponse) { _ = try await client.identity(wrongAudience, key: key) }
    await #expect(throws: YunleAccountError.invalidResponse) { _ = try await client.identity(saved.entitlement, key: P256.Signing.PrivateKey()) }
    claims["aud"] = "el-bot-ios"
    claims["scope"] = ["membership:read", "ai:agent"]
    let wrongScope = try signedToken(signer, claims: claims)
    await #expect(throws: YunleAccountError.invalidResponse) { _ = try await client.identity(wrongScope, key: key) }
}

@Test func yunleParsesDesktopAuthAndRuntimeErrorContracts() {
    #expect(yunleServiceErrorCode(Data(#"{"error":"client_unknown","code":"client_unknown"}"#.utf8)) == "client_unknown")
    #expect(yunleServiceErrorCode(Data(#"{"error":{"code":"DEVICE_AUTH_REQUIRED"}}"#.utf8)) == "DEVICE_AUTH_REQUIRED")
    #expect(yunleServiceErrorCode(Data(#"{"error":"upstream HTML or raw detail"}"#.utf8)) == "REQUEST_FAILED")
}

@Test func yunleCancellingAnInflightPollNeverInstallsTheGrant() async throws {
    let (client, transport, vault) = fixture()
    _ = try await client.beginLogin()
    await transport.pausePoll()
    let poll = Task { try await client.pollLogin() }
    while !(await transport.pollSuspended) { await Task.yield() }
    poll.cancel()
    await transport.releasePoll()
    await #expect(throws: CancellationError.self) { _ = try await poll.value }
    #expect(await vault.data == nil)
}
