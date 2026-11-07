import Foundation
import Testing
@testable import YunCore

private struct MutationReply: Sendable {
    var status = 200
    var json: String
}

private actor MutationFixture {
    private var deleted = false
    private var archived = false
    private var holdRead = false
    private var pendingDelete: CheckedContinuation<MutationReply, Never>?
    private var pendingRead: CheckedContinuation<MutationReply, Never>?
    private var deleteObserver: CheckedContinuation<Void, Never>?
    private var readObserver: CheckedContinuation<Void, Never>?
    private var staleReply: MutationReply?
    private(set) var deleteCount = 0

    func armStaleRead() { holdRead = true }
    func waitForDelete() async {
        if pendingDelete == nil { await withCheckedContinuation { deleteObserver = $0 } }
    }
    func waitForRead() async {
        if pendingRead == nil { await withCheckedContinuation { readObserver = $0 } }
    }
    func releaseDelete(success: Bool) {
        if success { deleted = true }
        pendingDelete?.resume(returning: MutationReply(status: success ? 200 : 503, json: success ? #"{"ok":true}"# : #"{"error":"unavailable"}"#))
        pendingDelete = nil
    }
    func releaseRead() {
        pendingRead?.resume(returning: staleReply!)
        pendingRead = nil
    }
    func respond(_ request: URLRequest) async -> MutationReply {
        let path = request.url!.path
        if request.httpMethod == "DELETE" {
            deleteCount += 1
            return await withCheckedContinuation {
                pendingDelete = $0; deleteObserver?.resume(); deleteObserver = nil
            }
        }
        if request.httpMethod == "PUT" {
            archived.toggle()
            return MutationReply(json: #"{"ok":true}"#)
        }
        if path.hasSuffix("/status") {
            return MutationReply(json: #"{"name":"Fixture","appId":"test","state":"online","checkedAt":"2026-11-07T00:00:00Z"}"#)
        }
        let summary = #"{"id":"mutation-session","title":"History","updatedAt":"2026-11-07T00:00:00Z","running":false,"archived":\#(archived),"source":{"platform":"qq","kind":"group","name":"Test group"}}"#
        let response = MutationReply(json: #"{"items":[\#(deleted ? "" : summary)]}"#)
        if holdRead {
            holdRead = false
            staleReply = response
            return await withCheckedContinuation {
                pendingRead = $0; readObserver?.resume(); readObserver = nil
            }
        }
        return response
    }
}

private final class MutationFixtures: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: MutationFixture] = [:]
    func set(_ fixture: MutationFixture, host: String) { lock.lock(); defer { lock.unlock() }; values[host] = fixture }
    func get(_ host: String) -> MutationFixture? { lock.lock(); defer { lock.unlock() }; return values[host] }
}
private final class MutationProtocol: URLProtocol, @unchecked Sendable {
    static let fixtures = MutationFixtures()
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host?.hasSuffix(".invalid") == true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url, let fixture = Self.fixtures.get(url.host ?? "") else { return }
        Task {
            let response = await fixture.respond(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: response.status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(response.json.utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() {}
}
@MainActor private func mutationStore(_ fixture: MutationFixture) throws -> ChatStore {
    let host = UUID().uuidString.lowercased() + ".invalid"
    MutationProtocol.fixtures.set(fixture, host: host)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MutationProtocol.self]
    return ChatStore(client: MobileAPI(endpoint: try Endpoint("https://" + host), token: "offline-fixture", session: URLSession(configuration: configuration)))
}

@Test @MainActor func deletionWaitsForAcknowledgementRetainsFailureAndAllowsRetry() async throws {
    let fixture = MutationFixture()
    let store = try mutationStore(fixture)
    await store.refresh()
    let first = Task { await store.delete("mutation-session", confirmation: "first-confirmation") }
    await fixture.waitForDelete()
    #expect(store.sessionOperation?.kind == .deleting)
    #expect(store.busy && store.sessions.count == 1)
    await store.delete("mutation-session", confirmation: "duplicate")
    #expect(await fixture.deleteCount == 1)
    await fixture.releaseDelete(success: false)
    await first.value
    #expect(store.sessions.count == 1 && store.sessionListRevision == 0)
    #expect(!store.busy && store.sessionOperation == nil)
    #expect(store.sessionErrorKey != nil)
    await store.refresh()
    #expect(store.sessionErrorKey != nil)
    let retry = Task { await store.delete("mutation-session", confirmation: "new-confirmation") }
    await fixture.waitForDelete()
    await fixture.releaseDelete(success: true)
    await retry.value
    #expect(store.sessions.isEmpty && store.sessionListRevision == 1)
    #expect(store.sessionErrorKey == nil && !store.busy)
}

@Test @MainActor func staleRefreshCannotResurrectDeletedConversation() async throws {
    let fixture = MutationFixture()
    let store = try mutationStore(fixture)
    await store.refresh()
    await fixture.armStaleRead()
    let stale = Task { await store.refresh() }
    await fixture.waitForRead()
    let deletion = Task { await store.delete("mutation-session", confirmation: "confirmed") }
    await fixture.waitForDelete()
    await fixture.releaseDelete(success: true)
    await deletion.value
    await fixture.releaseRead()
    await stale.value
    #expect(store.sessions.isEmpty && store.sessionListRevision == 1)
}

@Test @MainActor func archiveAndRestorePublishOnlyConfirmedListChanges() async throws {
    let store = try mutationStore(MutationFixture())
    await store.refresh()
    let original = try #require(store.sessions.first)
    await store.archive(original)
    #expect(store.sessions.first?.archived == true && store.sessionListRevision == 1)
    #expect(store.sessions.first?.source == original.source)
    await store.archive(try #require(store.sessions.first))
    #expect(store.sessions.first?.archived == false && store.sessionListRevision == 2)
    #expect(store.sessionOperation == nil && !store.busy)
}
