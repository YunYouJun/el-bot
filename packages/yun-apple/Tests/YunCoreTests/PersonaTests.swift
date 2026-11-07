import Foundation
import Testing
@testable import YunCore

@Test func personaSummaryUsesThePinnedRevisionRatherThanTheLatestImport() throws {
    let response = try MobileJSON.decoder().decode(PersonaResponse.self, from: personaFixture)
    #expect(response.library.cards.first?.metadata.name == "Latest")
    #expect(response.library.activeRevision?.metadata.name == "Original")
    #expect(response.library.cards.first?.source.canCheckUpdates == false)
    #expect(response.library.cards.first?.source.summary == "cloud.md")
    #expect(response.library.cards.first?.revisions.count == 2)
}

@Test func personaFileImportsAreUTF8TextWithAByteLimitAndNoServerPath() throws {
    let data = Data("# 云\nCharacter settings".utf8)
    let input = try PersonaImport.file(name: "cloud.md", data: data)
    let request = PersonaRequest(.import, input: input)
    let json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
    let encoded = try #require(json["input"] as? [String: Any])
    #expect(encoded["kind"] as? String == "text")
    #expect(encoded["text"] as? String == String(decoding: data, as: UTF8.self))
    #expect(encoded["path"] == nil)
    _ = try PersonaImport.file(name: "limit.md", data: Data(repeating: 65, count: 32 * 1024))
    #expect(throws: CompanionError.rejected("persona_too_large")) {
        try PersonaImport.file(name: "large.md", data: Data(String(repeating: "云", count: 11000).utf8))
    }
    for invalid in [Data([0xFF]), Data(), Data(" \n".utf8)] {
        #expect(throws: CompanionError.rejected("invalid_persona_file")) { try PersonaImport.file(name: "invalid.md", data: invalid) }
    }
}

@Test func nativePersonaAPIUsesDeviceAuthenticationAndHandlesOlderServers() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [PersonaProtocol.self]
    let session = URLSession(configuration: configuration)
    let api = MobileAPI(endpoint: try Endpoint("https://personas.invalid"), token: "fixture-device", session: session)
    let response = try await api.personas()
    #expect(response.instance.title == "Test bot")
    let old = MobileAPI(endpoint: try Endpoint("https://old-personas.invalid"), token: "fixture-device", session: session)
    await #expect(throws: CompanionError.rejected("not_found")) { try await old.personas() }
    let revoked = MobileAPI(endpoint: try Endpoint("https://personas.invalid"), token: "revoked", session: session)
    await #expect(throws: CompanionError.unauthorized) { try await revoked.personas() }
}

private let personaFixture: Data = {
    let old = String(repeating: "a", count: 64)
    let latest = String(repeating: "b", count: 64)
    func revision(_ hash: String, _ name: String) -> [String: Any] {
        ["hash": hash, "metadata": ["id": "cloud", "name": name], "source": ["kind": "text", "name": "cloud.md"],
         "importedAt": "2026-11-07T00:00:00.000Z"]
    }
    var card = revision(latest, "Latest")
    card["revisions"] = [revision(old, "Original"), revision(latest, "Latest")]
    return try! JSONSerialization.data(withJSONObject: [
        "library": ["version": 1, "cards": [card], "active": ["id": "cloud", "hash": old]],
        "instance": ["title": "Test bot"],
    ])
}()

private final class PersonaProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host?.hasSuffix("personas.invalid") == true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        let authorized = request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-device"
        let supported = url.host == "personas.invalid" && url.path == "/el-bot/mobile/v1/personas" && request.httpMethod == "POST"
        let status = !authorized ? 401 : supported ? 200 : 404
        let data = status == 200 ? personaFixture : Data("{\"error\":\"not_found\"}".utf8)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: status, httpVersion: nil,
                                                           headerFields: ["content-type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
