import Foundation
import Testing
@testable import YunCore

// These vectors were produced independently with Python hashlib/hmac, not by
// round-tripping the Swift implementation under test.
private let fixtureKey = Data(0..<32)
private let fixtureNonce = Data(32..<48)
private let fixtureResponse: DeviceToolJSON = .object([
    "v": .number(1), "nonce": .string("202122232425262728292a2b2c2d2e2f"),
    "ct": .string("lPUD5D+qr2kDodu/2ce7c3SXw4eDoU9DWHqBTSsj2aodR3AIldlReqCs3ig6BSo+Fw+DxlNXHuGeFM6O"),
    "tag": .string("dc430cd8a50c50ed0182e7098c6ee01f635b58398b74c608ffcb165975f1a249"),
])

@Test func iCtrlRequestMatchesIndependentWireVector() throws {
    let plaintext = Data(#"{"jsonrpc":"2.0","id":"fixture","method":"device_info","params":{}}"#.utf8)
    let sealed = try ICtrlEnvelope.seal(plaintext, key: fixtureKey, nonce: fixtureNonce, timestamp: 1_700_000_000)
    #expect(sealed.body["tok"].string == "630dcd29")
    #expect(sealed.body["ct"].string == "Z6dWFWeV4bhUtGo3vvxZtQG1hBhylkfXR9AWulZkeZ3yFhksGjqSnQSaGK1wEvbFfhIBRj5tW/cfL5feoPFwfLfG5A==")
    #expect(sealed.body["tag"].string == "5685f2c6dffc763837140f0354271c3439c84fc69458c002a0a3da369451a1cd")
    #expect(!sealed.body.formatted.contains("device_info"))
}

@Test func iCtrlResponseAuthenticatesBeforeDecrypting() throws {
    let bytes = try ICtrlEnvelope.open(fixtureResponse, key: fixtureKey, nonce: fixtureNonce)
    let value = try JSONDecoder().decode(DeviceToolJSON.self, from: bytes)
    #expect(value["result"]["model"].string == "iPhone")
    guard case .object(let original) = fixtureResponse else { return }
    for (key, replacement) in [
        ("ct", DeviceToolJSON.string(Data("forged".utf8).base64EncodedString())),
        ("tag", .string(String(repeating: "00", count: 32))),
        ("nonce", .string(String(repeating: "00", count: 16))),
        ("v", .number(2)),
    ] {
        var changed = original
        changed[key] = replacement
        #expect(throws: ICtrlError.invalidResponse) {
            try ICtrlEnvelope.open(.object(changed), key: fixtureKey, nonce: fixtureNonce)
        }
    }
    #expect(throws: ICtrlError.invalidResponse) {
        try ICtrlEnvelope.open(fixtureResponse, key: Data(repeating: 0, count: 32), nonce: fixtureNonce)
    }
}

private final class ICtrlFixtureProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "127.0.0.1" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        // No credential is ever returned; a denied pair must not lead to RPC.
        let status: Int
        let data: Data
        if url.path == "/whoami" {
            status = 200
            data = Data(#"{"device_id":"yun-test-denied-pair","protocol_version":1,"server_version":"1.35.0"}"#.utf8)
        } else if url.path == "/pair" {
            status = 403
            data = Data(#"{"error":{"code":"pair_denied"}}"#.utf8)
        } else {
            client?.urlProtocol(self, didFailWithError: ICtrlError.execution)
            return
        }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: [:])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@Test func iCtrlDeniedPairNeverEnablesDeviceActions() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [ICtrlFixtureProtocol.self]
    let client = ICtrlClient(session: URLSession(configuration: configuration))
    await #expect(throws: ICtrlError.denied) { try await client.pair() }
    await #expect(throws: ICtrlError.notPaired) { try await client.deviceInfo() }
    await #expect(throws: ICtrlError.notPaired) { try await client.openSamplePage() }
}

@Test func iCtrlCancelledTaskCannotStartAnAction() async {
    let client = ICtrlClient()
    let task = Task {
        withUnsafeCurrentTask { $0?.cancel() }
        return try await client.probe()
    }
    await #expect(throws: CancellationError.self) { try await task.value }
}
