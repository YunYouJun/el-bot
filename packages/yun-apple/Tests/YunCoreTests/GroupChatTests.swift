import Foundation
import Testing
@testable import YunCore

private final class GroupFixture: @unchecked Sendable {
    private let lock = NSLock()
    private var sends = 0
    private var manual = false
    private var sent = false
    private var previews: [String] = []
    private let loseReceipt: Bool
    private let previewTarget: String
    init(loseReceipt: Bool = true, previewTarget: String = "target") {
        self.loseReceipt = loseReceipt; self.previewTarget = previewTarget
    }
    var values: (Int, [String]) { lock.withLock { (sends, previews) } }
    let previewId = "017355c3-d489-49c4-9b07-ab17c7a51ccb"
    func response(_ request: URLRequest) throws -> Data {
        try lock.withLock {
            if request.httpMethod == "GET" {
                let control = manual ? #", "lease":{"id":"lease","phase":"active","expiresAt":4102444800000}"# : ""
                let receipts = sent ? #"[{"id":"\#(previewId)","status":"sent","messageId":"qq-sent"}]"# : "[]"
                return Data(#"{"messages":[{"id":"incoming","seq":1,"direction":"incoming","text":"owner QQ message","kind":"text","createdAt":"2026-11-07T00:00:00Z","senderId":"owner","senderName":"Owner","senderRole":"owner"},{"id":"bot","seq":2,"direction":"outgoing","text":"bot message","kind":"text","createdAt":"2026-11-07T00:00:01Z","status":"sent","manual":false}],"cursor":1,"hasMore":false,"captureStartedAt":"2026-11-07T00:00:00Z","online":true,"now":0,"control":{"id":"target","sessionId":"group-session","replyAvailable":true,"proactivePermission":"unknown"\#(control)},"deliveries":\#(receipts)}"#.utf8)
            }
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
            let value = try JSONSerialization.jsonObject(with: data) as! [String: String]
            switch value["operation"] {
            case "begin": manual = true; return Data("{}".utf8)
            case "preview":
                let text = value["text"]!
                previews.append(text)
                return try JSONSerialization.data(withJSONObject: ["preview":["id":previewId,"target":previewTarget,"title":"Group","scope":"group","text":text,"mode":"reply","expiresAt":4102444800000] as [String:Any]])
            case "send":
                sends += 1
                sent = true
                if loseReceipt { throw URLError(.timedOut) }
                return try JSONSerialization.data(withJSONObject: ["delivery": ["id": previewId, "status": "sent", "messageId": "qq-sent"]])
            default: return Data("{}".utf8)
            }
        }
    }
}

@Test(arguments: ["target", "another-group"]) @MainActor
func groupDirectSendValidatesDestinationAndClearsOnlyDeliveredDrafts(target: String) async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let host = UUID().uuidString.lowercased() + ".group-fixture.invalid"
    let fixture = GroupFixture(loseReceipt: false, previewTarget: target)
    GroupProtocol.set(fixture, host: host)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [GroupProtocol.self]
    let client = MobileAPI(endpoint: try Endpoint("https://" + host), token: "offline-test", session: URLSession(configuration: configuration))
    let summary = SessionSummary(id: "group-session", title: "Group", updatedAt: .now, running: false, workspace: nil, provider: nil, model: nil)
    let store = GroupChatStore(session: summary, client: client, outbox: PendingMessages(directory: directory))
    await store.takeover()
    await store.refresh()
    store.draft = "exact text"
    await store.send()
    #expect(fixture.values.0 == (target == "target" ? 1 : 0))
    #expect(store.draft == (target == "target" ? "" : "exact text"))
    #expect(store.pending == nil)
    #expect((store.errorKey == nil) == (target == "target"))
}
private final class GroupProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var fixtures: [String: GroupFixture] = [:]
    static func set(_ fixture: GroupFixture, host: String) { lock.withLock { fixtures[host] = fixture } }
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host?.hasSuffix(".group-fixture.invalid") == true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let fixture = Self.lock.withLock { Self.fixtures[request.url!.host!]! }
        do {
            let data = try fixture.response(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@Test @MainActor func groupHandoffSendsDirectlyAndReconcilesLostReceiptsWithoutResending() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let host = UUID().uuidString.lowercased() + ".group-fixture.invalid"
    let fixture = GroupFixture()
    GroupProtocol.set(fixture, host: host)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [GroupProtocol.self]
    let client = MobileAPI(endpoint: try Endpoint("https://" + host), token: "offline-test", session: URLSession(configuration: configuration))
    let summary = SessionSummary(id: "group-session", title: "Group", updatedAt: .now, running: false, workspace: nil, provider: nil, model: nil)
    let outbox = PendingMessages(directory: directory)
    let store = GroupChatStore(session: summary, client: client, outbox: outbox)
    await store.refresh()
    #expect(store.messages[0].outgoing == false)
    #expect(store.messages[0].senderRole == "owner")
    #expect(store.messages[1].outgoing == true)
    #expect(!store.canSend)
    await store.takeover()
    await store.refresh()
    store.draft = "  手动原文\n**保持字面**  "
    #expect(store.canSend)
    async let first: Void = store.send()
    async let duplicate: Void = store.send()
    _ = await (first, duplicate)
    #expect(!store.canSend)
    await store.send()
    #expect(store.pending?.requestId == fixture.previewId)
    #expect(fixture.values.0 == 1)
    let restarted = GroupChatStore(session: summary, client: client, outbox: outbox)
    await restarted.refresh()
    #expect(restarted.pending == nil)
    #expect(fixture.values.0 == 1)
    #expect(fixture.values.1 == ["  手动原文\n**保持字面**  "])
}

@Test func groupMemberProfileDecodesAnOptionalImpression() throws {
    let value = try MobileJSON.decoder().decode(
        GroupMemberProfile.self,
        from: Data(#"{"senderId":"member-1","impression":{"text":"喜欢猫，也常聊前端。","updatedAt":"2026-11-07T08:00:00.000Z"}}"#.utf8)
    )
    #expect(value.senderId == "member-1")
    #expect(value.impression?.text == "喜欢猫，也常聊前端。")
    #expect(value.impression?.updatedAt == Date(timeIntervalSince1970: 1_794_038_400))
    let empty = try MobileJSON.decoder().decode(GroupMemberProfile.self, from: Data(#"{"senderId":"member-2"}"#.utf8))
    #expect(empty.impression == nil)
}

@Test @MainActor func groupChatShowsCachedMessagesBeforeRefreshing() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let host = UUID().uuidString.lowercased() + ".group-fixture.invalid"
    GroupProtocol.set(GroupFixture(loseReceipt: false), host: host)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [GroupProtocol.self]
    let client = MobileAPI(endpoint: try Endpoint("https://" + host), token: "offline-test", session: URLSession(configuration: configuration))
    let summary = SessionSummary(id: "cached-group-session", title: "Group", updatedAt: .now, running: false, workspace: nil, provider: nil, model: nil)
    let first = GroupChatStore(session: summary, client: client, outbox: PendingMessages(directory: directory))
    await first.refresh()
    #expect(first.messages.map(\.id) == ["incoming", "bot"])

    let second = GroupChatStore(session: summary, client: client, outbox: PendingMessages(directory: directory))
    #expect(second.messages.map(\.id) == ["incoming", "bot"])
    #expect(second.state == nil)
}

@Test func groupChatStateIgnoresThePollingClockForEquality() {
    let base = GroupChatState(
        context: nil, messages: [], cursor: 1, hasMore: false,
        captureStartedAt: Date(timeIntervalSince1970: 0),
        online: true, now: 1, control: nil, deliveries: []
    )
    let next = GroupChatState(
        context: nil, messages: [], cursor: 1, hasMore: false,
        captureStartedAt: Date(timeIntervalSince1970: 0),
        online: true, now: 2, control: nil, deliveries: []
    )
    #expect(base == next)
}
