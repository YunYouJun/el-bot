import Foundation
import Testing
@testable import YunCore

private struct ComposeReply: Sendable {
    var status = 200
    var json: String
}

private final class ComposeFixture: @unchecked Sendable {
    private let lock = NSLock()
    private var creates = 0
    private var sends = 0
    private var failNextSend = true
    var createCount: Int { lock.withLock { creates } }
    var sendCount: Int { lock.withLock { sends } }

    func respond(_ request: URLRequest) -> ComposeReply {
        lock.lock()
        defer { lock.unlock() }
        let path = request.url?.path ?? ""
        if request.httpMethod == "POST", path.hasSuffix("/sessions") {
            creates += 1
            return ComposeReply(status: 201, json: #"{"sessionId":"created-session"}"#)
        }
        if request.httpMethod == "POST", path.hasSuffix("/sessions/created-session/messages") {
            sends += 1
            if failNextSend {
                failNextSend = false
                return ComposeReply(status: 503, json: #"{"error":"unavailable"}"#)
            }
            return ComposeReply(json: #"{"accepted":true}"#)
        }
        if path.hasSuffix("/status") {
            return ComposeReply(json: #"{"name":"Fixture","appId":"test","state":"online","checkedAt":"2026-11-07T00:00:00Z"}"#)
        }
        return ComposeReply(json: #"{"items":[{"id":"created-session","title":"First prompt","updatedAt":"2026-11-07T00:00:00Z","running":false}]}"#)
    }
}

private final class ComposeFixtures: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: ComposeFixture] = [:]
    func set(_ fixture: ComposeFixture, host: String) { lock.lock(); defer { lock.unlock() }; values[host] = fixture }
    func get(_ host: String) -> ComposeFixture? { lock.lock(); defer { lock.unlock() }; return values[host] }
}

private final class ComposeProtocol: URLProtocol, @unchecked Sendable {
    static let fixtures = ComposeFixtures()
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host?.hasSuffix(".invalid") == true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let request = self.request
        guard let url = request.url, let fixture = Self.fixtures.get(url.host ?? "") else { return }
        let response = fixture.respond(request)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: response.status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(response.json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@Test @MainActor func firstMessageCreatesOneSessionAndRetryReusesIt() async throws {
    let fixture = ComposeFixture()
    let host = UUID().uuidString.lowercased() + ".invalid"
    ComposeProtocol.fixtures.set(fixture, host: host)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [ComposeProtocol.self]
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    let outbox = PendingMessages(directory: directory)
    let store = ChatStore(
        client: MobileAPI(endpoint: try Endpoint("https://" + host), token: "offline-fixture", session: URLSession(configuration: configuration)),
        outbox: outbox
    )

    #expect(await store.createAndSend("Hello") == nil)
    #expect(fixture.createCount == 1)
    #expect(fixture.sendCount == 1)
    let pending = try await outbox.load(origin: store.client!.endpoint.absoluteString, sessionId: "created-session")
    #expect(pending?.text == "Hello")

    #expect(await store.createAndSend("Hello") == "created-session")
    #expect(fixture.createCount == 1)
    #expect(fixture.sendCount == 2)
    let cleared = try await outbox.load(origin: store.client!.endpoint.absoluteString, sessionId: "created-session")
    #expect(cleared == nil)
    #expect(store.sessions.map(\.id) == ["created-session"])
}
