import CryptoKit
import Foundation
import Security

public enum ICtrlError: Error, Sendable, Equatable {
    case unavailable, incompatible, notPaired, denied, busy, keyRejected, invalidResponse, tooLarge, storage, execution

    public var localizationKey: String {
        switch self {
        case .unavailable: "tools.error.unavailable"
        case .incompatible: "tools.error.incompatible"
        case .notPaired: "tools.error.not_paired"
        case .denied: "tools.error.denied"
        case .busy: "tools.error.busy"
        case .keyRejected: "tools.error.key_rejected"
        case .invalidResponse: "tools.error.response"
        case .tooLarge: "tools.error.too_large"
        case .storage: "error.storage"
        case .execution: "tools.error.execution"
        }
    }
}

public struct ICtrlStatus: Sendable {
    public let version: String
    public let paired: Bool
    public let deviceInfo: DeviceToolJSON?
}

/// Local-only adapter. It deliberately exposes no arbitrary RPC or configurable server URL.
public actor ICtrlClient {
    private struct Credential: Codable, Sendable { let deviceID: String; let key: Data }
    private let session: URLSession
    private let vault = KeychainVault()
    private var credential: Credential?
    private let origin = URL(string: "http://127.0.0.1:8200")!
    private static let maximumBytes = 1024 * 1024

    public init(session: URLSession? = nil) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.connectionProxyDictionary = [:]
        self.session = session ?? URLSession(configuration: configuration, delegate: ICtrlNoRedirect(), delegateQueue: nil)
    }

    public func probe() async throws -> ICtrlStatus {
        let identity = try await identify()
        let deviceID = identity["device_id"].string!
        if credential?.deviceID != deviceID {
            do {
                credential = try vault.load(origin: account(deviceID)).flatMap { try JSONDecoder().decode(Credential.self, from: $0) }
            } catch { throw ICtrlError.storage }
        }
        guard credential != nil else {
            return ICtrlStatus(version: identity["server_version"].string ?? "—", paired: false, deviceInfo: nil)
        }
        let info: DeviceToolJSON
        do { info = try await deviceInfo() }
        catch ICtrlError.keyRejected {
            return ICtrlStatus(version: identity["server_version"].string ?? "—", paired: false, deviceInfo: nil)
        }
        guard info["device_id"].string == deviceID else { throw ICtrlError.invalidResponse }
        return ICtrlStatus(version: identity["server_version"].string ?? "—", paired: true, deviceInfo: info)
    }

    public func pair() async throws -> ICtrlStatus {
        let identity = try await identify()
        let deviceID = identity["device_id"].string!
        let privateKey = Curve25519.KeyAgreement.PrivateKey()
        let publicKey = privateKey.publicKey.rawRepresentation
        let (status, body) = try await request("pair", body: .object([
            "client_name": .string("Yun · iPhone"), "pub": .string(publicKey.base64EncodedString()),
        ]), timeout: 85)
        guard status != 403 else { throw ICtrlError.denied }
        guard status != 429 else { throw ICtrlError.busy }
        guard status == 200,
              let encoded = body["pub"].string, let peerData = Data(base64Encoded: encoded), peerData.count == 32,
              let hex = body["token_ct"].string, let wrapped = Data(ictrlHex: hex), wrapped.count == 32 else {
            throw ICtrlError.invalidResponse
        }
        let peer = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: peerData)
        let shared = try privateKey.sharedSecretFromKeyAgreement(with: peer).withUnsafeBytes { Data($0) }
        let wrappingKey = ICtrlEnvelope.hmac(shared, Data("ictrl-pair".utf8) + publicKey + peerData)
        let pad = ICtrlEnvelope.hmac(wrappingKey, Data("ictrl-wrap".utf8))
        let key = Data(zip(wrapped, pad).map { $0 ^ $1 })
        guard body["tok"].string == ICtrlEnvelope.token(key) else { throw ICtrlError.invalidResponse }
        try Task.checkCancellation()
        let candidate = Credential(deviceID: deviceID, key: key)
        let info = try await call("device_info", credential: candidate)
        guard info["device_id"].string == deviceID else { throw ICtrlError.invalidResponse }
        do { try vault.save(JSONEncoder().encode(candidate), origin: account(deviceID)) }
        catch { throw ICtrlError.storage }
        credential = candidate
        return ICtrlStatus(version: identity["server_version"].string ?? "—", paired: true, deviceInfo: info)
    }

    /// Removes the local key. Remote revocation is managed in iCTRL's client list.
    public func forget() {
        if let credential { vault.remove(origin: account(credential.deviceID)) }
        credential = nil
    }

    public func deviceInfo() async throws -> DeviceToolJSON { try await authorized("device_info") }

    /// Fixed, non-account-changing acceptance flow; no model-provided parameters.
    public func openSamplePage() async throws {
        _ = try await authorized("open_url", params: ["url": .string("https://example.com")])
    }

    public func readSamplePage() async throws -> DeviceToolJSON {
        let info = try await deviceInfo()
        guard info["system"]["screen_locked"].bool == false,
              info["system"]["foreground_is_browser"].bool == true,
              let browser = info["system"]["foreground_app"].string, !browser.isEmpty else { throw ICtrlError.execution }
        return try await authorized("page_source", params: [
            "bundle_id": .string(browser), "visible_only": .bool(true), "max_elements": .number(100),
        ])
    }

    public func returnToYun() async throws {
        _ = try await authorized("activate_app", params: ["bundle_id": .string("cn.elpsy.elbot.client")])
    }

    private func authorized(_ method: String, params: [String: DeviceToolJSON] = [:]) async throws -> DeviceToolJSON {
        guard let credential else { throw ICtrlError.notPaired }
        return try await call(method, params: params, credential: credential)
    }

    private func call(_ method: String, params: [String: DeviceToolJSON] = [:], credential: Credential) async throws -> DeviceToolJSON {
        try Task.checkCancellation()
        let id = UUID().uuidString
        let rpc: DeviceToolJSON = .object(["jsonrpc": .string("2.0"), "id": .string(id), "method": .string(method), "params": .object(params)])
        var nonce = Data(count: 16)
        let randomStatus = nonce.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!) }
        guard randomStatus == errSecSuccess else { throw ICtrlError.execution }
        let sealed = try ICtrlEnvelope.seal(JSONEncoder().encode(rpc), key: credential.key, nonce: nonce,
                                            timestamp: UInt64(Date().timeIntervalSince1970))
        let (status, body) = try await request("rpc", body: sealed.body)
        if status == 401 {
            // An HTTP error is not authenticated. Preserve the stored key so a
            // clock-skew response or unrelated local process cannot destroy it.
            self.credential = nil
            throw ICtrlError.keyRejected
        }
        guard status == 200 else { throw ICtrlError.execution }
        let plaintext = try ICtrlEnvelope.open(body, key: credential.key, nonce: nonce)
        let reply = try JSONDecoder().decode(DeviceToolJSON.self, from: plaintext)
        guard reply["jsonrpc"].string == "2.0", reply["id"].string == id else { throw ICtrlError.invalidResponse }
        guard reply["error"] == .null else { throw ICtrlError.execution }
        guard case .object = reply["result"] else { throw ICtrlError.invalidResponse }
        return reply["result"]
    }

    private func identify() async throws -> DeviceToolJSON {
        let (status, value) = try await request("whoami")
        guard status == 200 else { throw ICtrlError.unavailable }
        guard value["protocol_version"].number == 1 else { throw ICtrlError.incompatible }
        guard let id = value["device_id"].string, !id.isEmpty, id.utf8.count <= 128 else { throw ICtrlError.invalidResponse }
        return value
    }

    private func account(_ id: String) -> String { "ictrl-local:" + id }

    private func request(_ path: String, body: DeviceToolJSON? = nil, timeout: TimeInterval = 12) async throws -> (Int, DeviceToolJSON) {
        try Task.checkCancellation()
        let url = origin.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        do {
            let (bytes, response) = try await session.bytes(for: request)
            guard let response = response as? HTTPURLResponse, response.url == url else { throw ICtrlError.invalidResponse }
            guard response.expectedContentLength <= Self.maximumBytes else { throw ICtrlError.tooLarge }
            var data = Data()
            for try await byte in bytes {
                guard data.count < Self.maximumBytes else { throw ICtrlError.tooLarge }
                data.append(byte)
            }
            try Task.checkCancellation()
            return (response.statusCode, try JSONDecoder().decode(DeviceToolJSON.self, from: data))
        } catch let error as URLError {
            if error.code == .cancelled || Task.isCancelled { throw CancellationError() }
            throw ICtrlError.unavailable
        }
    }
}

private final class ICtrlNoRedirect: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
