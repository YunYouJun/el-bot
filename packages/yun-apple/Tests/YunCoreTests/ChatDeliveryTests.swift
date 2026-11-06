import Foundation
import Testing
@testable import YunCore

private final class ChatFixture: @unchecked Sendable {
    let lock = NSLock()
    var requests: [String] = []
    var authorizations: [String] = []
    var modelSelections: [String] = []
    let reconcileAccepted: Bool
    let informationAvailable: Bool
    init(reconcileAccepted: Bool = false, informationAvailable: Bool = true) {
        self.reconcileAccepted = reconcileAccepted
        self.informationAvailable = informationAvailable
    }
    let sessionJSON = """
    {"id":"shared-session","title":"Shared conversation","updatedAt":"2026-11-06T00:00:00Z","running":false}
    """
    func respond(_ request: URLRequest) -> Result<Data, Error> {
        lock.lock(); defer { lock.unlock() }
        authorizations.append(request.value(forHTTPHeaderField: "Authorization") ?? "")
        if request.httpMethod == "GET", request.url?.path.hasSuffix("/info") == true {
            return informationAvailable ? .success(Data(sessionJSON.utf8)) : .failure(URLError(.unsupportedURL))
        }
        if request.httpMethod == "GET", request.url?.path.hasSuffix("/models") == true {
            return .success(Data("""
            {
              "current":{"provider":"tokenlink","model":"hy4"},
              "groups":[{
                "id":"tokenlink",
                "name":"TokenLink",
                "models":[
                  {"id":"hy4","name":"Hunyuan 4"},
                  {"id":"hy4-thinking","name":"Hunyuan 4 Thinking","description":"Longer reasoning"}
                ]
              },{
                "id":"openai",
                "name":"OpenAI",
                "models":[{"id":"gpt-6-luna","name":"GPT-6 Luna"}]
              }]
            }
            """.utf8))
        }
        if request.httpMethod == "PUT" {
            var data = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var bytes = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let count = stream.read(&bytes, maxLength: bytes.count)
                    if count <= 0 { break }
                    data.append(contentsOf: bytes.prefix(count))
                }
            }
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
            let provider = object?["provider"] ?? "missing"
            let model = object?["model"] ?? "missing"
            modelSelections.append(provider + "/" + model)
            return .success(Data("{\"selected\":{\"provider\":\"\(provider)\",\"model\":\"\(model)\"}}".utf8))
        }
        if request.httpMethod == "POST" {
            var data = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var bytes = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let n = stream.read(&bytes, maxLength: bytes.count)
                    if n <= 0 { break }
                    data.append(contentsOf: bytes.prefix(n))
                }
            }
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
            requests.append(object?["requestId"] ?? "missing")
            if requests.count == 1 { return .failure(URLError(.timedOut)) }
            return .success(Data("{\"accepted\":true}".utf8))
        }
        let messages: [[String: String]] = reconcileAccepted && !requests.isEmpty
            ? [["id": "shared-session:1", "role": "user", "text": "Continue the same conversation", "createdAt": "2026-11-06T00:00:00Z", "requestId": requests[0]]]
            : []
        let encoded = String(decoding: try! JSONEncoder().encode(messages), as: UTF8.self)
        return .success(Data("{\"session\":\(sessionJSON),\"messages\":\(encoded),\"hasMore\":false,\"cursor\":1}".utf8))
    }
}

@Test @MainActor func conversationInformationIsReadOnlyAndKeepsOlderServicesUsable() async throws {
    for available in [true, false] {
        let host = UUID().uuidString.lowercased() + ".invalid"
        let fixture = ChatFixture(informationAvailable: available)
        ChatProtocol.fixtures.set(fixture, host: host)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ChatProtocol.self]
        let api = MobileAPI(endpoint: try Endpoint("https://" + host), token: "fixture-credential", session: URLSession(configuration: configuration))
        let session = try MobileJSON.decoder().decode(SessionSummary.self, from: Data(fixture.sessionJSON.utf8))
        let model = ConversationStore(session: session, client: api)
        await model.switchModel(provider: "openai", model: "gpt-6-luna")
        await model.loadInformation()
        #expect(model.information?.id == (available ? session.id : nil))
        #expect(model.informationErrorKey == (available ? nil : "chat.info.unavailable"))
        #expect(model.summary.id == session.id)
        #expect(model.currentModel?.model == "gpt-6-luna")
        #expect(!model.loadingInformation)
        #expect(fixture.requests.isEmpty)
    }
}

private final class FixtureRegistry: @unchecked Sendable {
    let lock = NSLock()
    private var entries: [String: ChatFixture] = [:]
    func set(_ fixture: ChatFixture, host: String) { lock.lock(); defer { lock.unlock() }; entries[host] = fixture }
    func get(_ host: String) -> ChatFixture? { lock.lock(); defer { lock.unlock() }; return entries[host] }
}

private final class ChatProtocol: URLProtocol, @unchecked Sendable {
    static let fixtures = FixtureRegistry()
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host?.hasSuffix(".invalid") == true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url, let fixture = Self.fixtures.get(url.host ?? "") else { return }
        switch fixture.respond(request) {
        case .failure(let error): client?.urlProtocol(self, didFailWithError: error)
        case .success(let data):
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["content-type": "application/json"])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() {}
}

@Test @MainActor func nativeModelCatalogLoadsAndSwitchesTheNextRequestRoute() async throws {
    let host = UUID().uuidString.lowercased() + ".invalid"
    let fixture = ChatFixture()
    ChatProtocol.fixtures.set(fixture, host: host)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [ChatProtocol.self]
    let api = MobileAPI(
        endpoint: try Endpoint("https://" + host),
        token: "fixture-credential",
        session: URLSession(configuration: configuration)
    )
    let session = try MobileJSON.decoder().decode(SessionSummary.self, from: Data(fixture.sessionJSON.utf8))
    let model = ConversationStore(session: session, client: api)

    await model.loadModels()
    #expect(model.modelCatalog?.groups.count == 2)
    #expect(model.currentModel == ModelRoute(provider: "tokenlink", model: "hy4"))
    #expect(model.currentModelName == "Hunyuan 4")

    await model.switchModel(provider: "openai", model: "gpt-6-luna")
    #expect(model.currentModel == ModelRoute(provider: "openai", model: "gpt-6-luna"))
    #expect(model.currentModelName == "GPT-6 Luna")
    #expect(model.summary.provider == "openai")
    #expect(model.summary.model == "gpt-6-luna")
    #expect(model.modelCatalog?.current == model.currentModel)
    #expect(!model.switchingModel)
    #expect(fixture.modelSelections == ["openai/gpt-6-luna"])
    #expect(fixture.authorizations.allSatisfy { $0 == "Bearer fixture-credential" })
}

@Test @MainActor func uncertainSendRetainsItsIdentityAcrossClientRestart() async throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: folder) }
    let host = UUID().uuidString.lowercased() + ".invalid"
    let endpoint = try Endpoint("https://" + host)
    let fixture = ChatFixture()
    ChatProtocol.fixtures.set(fixture, host: host)
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [ChatProtocol.self]
    let client = MobileAPI(endpoint: endpoint, token: "fixture-credential", session: URLSession(configuration: config))
    let session = try MobileJSON.decoder().decode(SessionSummary.self, from: Data(fixture.sessionJSON.utf8))
    let outbox = PendingMessages(directory: folder)
    let first = ConversationStore(session: session, client: client, outbox: outbox)
    await first.refresh()
    first.draft = "Continue the same conversation"
    await first.send()
    let savedID = try #require(first.pending?.requestId)
    #expect(!first.canSend)
    let restored = ConversationStore(session: session, client: client, outbox: PendingMessages(directory: folder))
    await restored.refresh()
    #expect(restored.pending?.requestId == savedID)
    await restored.send(retry: true)
    #expect(restored.pending == nil)
    #expect(try await outbox.load(origin: endpoint.absoluteString, sessionId: session.id) == nil)
    #expect(fixture.requests == [savedID, savedID])
    #expect(fixture.authorizations.allSatisfy { $0 == "Bearer fixture-credential" })
}

@Test func outboxIsPrivateAndScopedToTheServerAndSession() async throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: folder) }
    let outbox = PendingMessages(directory: folder)
    let message = PendingMessage(sessionId: String(repeating: "s", count: 128), text: "Only a pending outgoing message")
    try await outbox.save(message, origin: "https://one.invalid")
    #expect(try await outbox.load(origin: "https://two.invalid", sessionId: message.sessionId) == nil)
    let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
    #expect(files.count == 1)
    let permissions = try FileManager.default.attributesOfItem(atPath: files[0].path)[.posixPermissions] as? Int
    #expect(permissions == 0o600)
}

@Test @MainActor func persistedReceiptResolvesAnUncertainSendWithoutPostingAgain() async throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: folder) }
    let host = UUID().uuidString.lowercased() + ".invalid"
    let fixture = ChatFixture(reconcileAccepted: true)
    ChatProtocol.fixtures.set(fixture, host: host)
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [ChatProtocol.self]
    let api = MobileAPI(endpoint: try Endpoint("https://" + host), session: URLSession(configuration: config))
    let session = try MobileJSON.decoder().decode(SessionSummary.self, from: Data(fixture.sessionJSON.utf8))
    let model = ConversationStore(session: session, client: api, outbox: PendingMessages(directory: folder))
    await model.refresh()
    model.draft = "Continue the same conversation"
    await model.send()
    #expect(model.pending != nil)
    await model.refresh()
    #expect(model.pending == nil)
    #expect(model.draft.isEmpty)
    #expect(fixture.requests.count == 1)
    #expect(model.messages.count == 1)
}
