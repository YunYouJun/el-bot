import CryptoKit
import Foundation
import Security

public struct YunlePointAccount: Codable, Sendable, Equatable {
    public let availableMicroPoints: Int64
    public let reservedMicroPoints: Int64
    public let chargedMicroPoints: Int64
}
public struct YunleAccountOverview: Codable, Sendable {
    public let userId: String
    public let account: YunlePointAccount
}
public struct YunleUsageReceipt: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let taskId: String
    public let type: String
    public let chargedMicroPoints: Int64
    public let createdAt: Int64
    public let model: String?
    public let inputTokens: Int64?
    public let outputTokens: Int64?
    public var date: Date { Date(timeIntervalSince1970: Double(createdAt) / 1000) }
}
public struct YunleUsagePage: Codable, Sendable {
    public let items: [YunleUsageReceipt]
    public let nextCursor: String?
}
public struct YunleModelConsumption: Codable, Sendable, Identifiable, Equatable {
    public let model: String?
    public let chargedMicroPoints: Int64
    public let refundedMicroPoints: Int64
    public let netMicroPoints: Int64
    public let settlementCount: Int64
    public let inputTokens: Int64
    public let outputTokens: Int64
    public let unattributedCount: Int64
    public var id: String { model.map { "model:\($0)" } ?? "unattributed" }
}
public struct YunleConsumptionPeriod: Codable, Sendable, Equatable {
    public let from: Int64
    public let chargedMicroPoints: Int64
    public let refundedMicroPoints: Int64
    public let netMicroPoints: Int64
    public let settlementCount: Int64
    public let inputTokens: Int64
    public let outputTokens: Int64
    public let unattributedCount: Int64
    public let models: [YunleModelConsumption]
}
public struct YunleConsumptionSummary: Codable, Sendable, Equatable {
    public let applicationId: String
    public let timeZone: String
    public let asOf: Int64
    public let today: YunleConsumptionPeriod
    public let month: YunleConsumptionPeriod
    public let lifetime: YunleConsumptionPeriod

    func validate() throws {
        let maximum: Int64 = 9_007_199_254_740_991
        func amounts(_ charged: Int64, _ refunded: Int64, _ net: Int64, _ count: Int64, _ input: Int64, _ output: Int64, _ missing: Int64) -> Bool {
            [charged, refunded, count, input, output, missing].allSatisfy { (0...maximum).contains($0) }
                && charged - refunded == net && missing <= count
        }
        guard applicationId == "el-bot", timeZone == "Asia/Shanghai", asOf > 0, asOf <= Int64(Date().timeIntervalSince1970 * 1000) + 300_000,
              lifetime.from == 0, month.from > 0, month.from <= today.from, today.from <= asOf else { throw YunleAccountError.invalidResponse }
        let expectedDay = ((asOf + 28_800_000) / 86_400_000) * 86_400_000 - 28_800_000
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 28_800)!
        let monthDate = calendar.date(from: calendar.dateComponents([.year, .month], from: Date(timeIntervalSince1970: Double(asOf) / 1000)))!
        guard today.from == expectedDay, month.from == Int64(monthDate.timeIntervalSince1970 * 1000) else { throw YunleAccountError.invalidResponse }
        for period in [today, month, lifetime] {
            guard amounts(period.chargedMicroPoints, period.refundedMicroPoints, period.netMicroPoints, period.settlementCount, period.inputTokens, period.outputTokens, period.unattributedCount),
                  period.models.count <= 256, Set(period.models.map(\.id)).count == period.models.count else { throw YunleAccountError.invalidResponse }
            for model in period.models {
                guard model.model == nil || (!model.model!.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && model.model!.count <= 256),
                      amounts(model.chargedMicroPoints, model.refundedMicroPoints, model.netMicroPoints, model.settlementCount, model.inputTokens, model.outputTokens, model.unattributedCount) else { throw YunleAccountError.invalidResponse }
            }
            let checks: [(KeyPath<YunleModelConsumption, Int64>, Int64)] = [
                (\.chargedMicroPoints, period.chargedMicroPoints), (\.refundedMicroPoints, period.refundedMicroPoints),
                (\.inputTokens, period.inputTokens), (\.outputTokens, period.outputTokens), (\.unattributedCount, period.unattributedCount),
            ]
            for (path, expected) in checks {
                var sum: Int64 = 0
                for model in period.models {
                    let (next, overflow) = sum.addingReportingOverflow(model[keyPath: path])
                    guard !overflow, next <= maximum else { throw YunleAccountError.invalidResponse }
                    sum = next
                }
                guard sum == expected else { throw YunleAccountError.invalidResponse }
            }
        }
    }
}
public struct YunleDeviceLogin: Sendable {
    public let verificationURL: URL
    public let userCode: String
    public let expiresAt: Date
    public let interval: UInt64
}
public enum YunleAccountError: Error, Sendable, Equatable {
    case service(String)
    case invalidResponse
    case signInRequired
    case refreshUncertain
    case storage
}
public protocol YunleAccountTransport: Sendable {
    func send(_ request: URLRequest) async throws -> Data
}
public protocol YunleCredentialStorage: Sendable {
    func load() async throws -> Data?
    func save(_ data: Data) async throws
    func remove() async throws
}
public protocol YunleAccountServing: Sendable {
    func restore() async throws -> String?
    func beginLogin() async throws -> YunleDeviceLogin
    func pollLogin() async throws -> String?
    func cancelLogin() async
    func overview() async throws -> YunleAccountOverview
    func consumptionSummary() async throws -> YunleConsumptionSummary
    func usage(cursor: String?) async throws -> YunleUsagePage
    func logout() async throws
}
private final class NoAccountRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
public struct SystemYunleAccountTransport: YunleAccountTransport {
    private let session: URLSession
    public init() {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 25
        config.httpCookieStorage = nil
        session = URLSession(configuration: config, delegate: NoAccountRedirects(), delegateQueue: nil)
    }
    public func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, data.count <= 1_048_576 else { throw YunleAccountError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw YunleAccountError.service(yunleServiceErrorCode(data))
        }
        return data
    }
}
public struct SystemYunleCredentialStorage: YunleCredentialStorage {
    public init() {}
    private var query: [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: "cn.elpsy.yun.yunle-account", kSecAttrAccount: "el-bot-ios"]
    }
    public func load() async throws -> Data? {
        var q = query
        q[kSecReturnData] = true
        q[kSecMatchLimit] = kSecMatchLimitOne
        var value: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &value)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = value as? Data else { throw YunleAccountError.storage }
        return data
    }
    public func save(_ data: Data) async throws {
        let attributes: [CFString: Any] = [kSecValueData: data, kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw YunleAccountError.storage }
        var q = query
        attributes.forEach { q[$0.key] = $0.value }
        guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw YunleAccountError.storage }
    }
    public func remove() async throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw YunleAccountError.storage }
    }
}

/// Independent read-only account grant. Cloud-instance billing credentials never enter the app.
public actor YunleAccountClient: YunleAccountServing {
    static let clientID = "el-bot-ios"
    static var deviceName: String {
        #if os(macOS)
        "小云 macOS"
        #else
        "小云 iOS"
        #endif
    }
    static let authURL = URL(string: "https://api.yunle.fun/desktop-auth")!
    static let accountURL = URL(string: "https://ai-runtime-193029-4-1325586649.sh.run.tcloudbase.com/ai/v1/mobile/el-bot-account")!
    struct Credentials: Codable, Sendable {
        let key: Data
        let entitlement: String
        let refreshToken: String
        let userID: String
        let expiresAt: Date
        var refreshPending: Bool
    }
    struct Pending {
        let key: P256.Signing.PrivateKey
        let deviceCode: String
        let expiresAt: Date
    }
    private let transport: any YunleAccountTransport
    private let storage: any YunleCredentialStorage
    private let anchors: [String: Data]
    private var credentials: Credentials?
    private var pending: Pending?
    private var operation = false
    private var epoch = UUID()
    public init(transport: any YunleAccountTransport = SystemYunleAccountTransport(), storage: any YunleCredentialStorage = SystemYunleCredentialStorage()) {
        self.transport = transport
        self.storage = storage
        anchors = ["desktop-2026-06": Data(yunleBase64URL: "XMgjAUTRx4E1C2IYkW-XZZyCNIWy8OkX_L2EK_AXR9I")!]
    }
    init(transport: any YunleAccountTransport, storage: any YunleCredentialStorage, anchors: [String: Data]) {
        self.transport = transport; self.storage = storage; self.anchors = anchors
    }
    public func restore() async throws -> String? {
        guard let data = try await storage.load() else { return nil }
        let saved = try JSONDecoder().decode(Credentials.self, from: data)
        let key = try P256.Signing.PrivateKey(rawRepresentation: saved.key)
        let identity = try identity(saved.entitlement, key: key, allowExpired: true)
        guard identity.uid == saved.userID, identity.expiresAt == saved.expiresAt else { throw YunleAccountError.invalidResponse }
        credentials = saved
        return saved.userID
    }
    public func beginLogin() async throws -> YunleDeviceLogin {
        guard !operation, credentials == nil else { throw YunleAccountError.service("AUTH_BUSY") }
        operation = true
        defer { operation = false }
        let key = P256.Signing.PrivateKey()
        let result = try await call(Self.authURL, ["action": "startDeviceAuth", "clientId": Self.clientID, "scope": ["membership:read", "ai:usage"], "deviceName": Self.deviceName, "devicePublicJwk": jwk(key)], key: key)
        guard let code = result["deviceCode"] as? String, !code.isEmpty, code.count <= 256,
              let userCode = result["userCode"] as? String, userCode.range(of: "^[A-Z0-9]{4}-[A-Z0-9]{4}$", options: .regularExpression) != nil,
              let rawURL = result["verificationUriComplete"] as? String, let url = URL(string: rawURL),
              url.scheme == "https", url.host == "www.yunle.fun", url.port == nil, url.path == "/link", url.user == nil, url.password == nil, url.fragment == nil,
              URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems == [URLQueryItem(name: "code", value: userCode)],
              let expires = result["expiresIn"] as? Int, (1...1800).contains(expires), let interval = result["interval"] as? Int, (1...60).contains(interval) else { throw YunleAccountError.invalidResponse }
        try Task.checkCancellation()
        let expiresAt = Date().addingTimeInterval(Double(expires))
        pending = Pending(key: key, deviceCode: code, expiresAt: expiresAt)
        return YunleDeviceLogin(verificationURL: url, userCode: userCode, expiresAt: expiresAt, interval: UInt64(interval))
    }
    public func pollLogin() async throws -> String? {
        guard !operation, let pending else { throw YunleAccountError.signInRequired }
        guard pending.expiresAt > Date() else { self.pending = nil; throw YunleAccountError.service("AUTH_EXPIRED") }
        operation = true
        defer { operation = false }
        let attempt = epoch
        let result = try await call(Self.authURL, ["action": "pollDeviceToken", "deviceCode": pending.deviceCode], key: pending.key)
        guard attempt == epoch, !Task.isCancelled else { throw CancellationError() }
        switch result["status"] as? String {
        case "approved":
            let received = try received(result, key: pending.key)
            try await storage.save(JSONEncoder().encode(received))
            guard attempt == epoch, !Task.isCancelled else {
                try await storage.remove()
                throw CancellationError()
            }
            credentials = received
            self.pending = nil
            return received.userID
        case "pending": return nil
        case "slow_down": throw YunleAccountError.service("AUTH_SLOW_DOWN")
        case "denied": self.pending = nil; throw YunleAccountError.service("AUTH_DENIED")
        case "expired": self.pending = nil; throw YunleAccountError.service("AUTH_EXPIRED")
        default: throw YunleAccountError.invalidResponse
        }
    }
    public func cancelLogin() { pending = nil; epoch = UUID() }
    public func overview() async throws -> YunleAccountOverview {
        let result = try await accountCall(["action": "account"])
        let value = try JSONDecoder().decode(YunleAccountOverview.self, from: JSONSerialization.data(withJSONObject: result))
        guard value.userId == credentials?.userID, [value.account.availableMicroPoints, value.account.reservedMicroPoints, value.account.chargedMicroPoints].allSatisfy({ $0 >= 0 }) else { throw YunleAccountError.invalidResponse }
        return value
    }
    public func usage(cursor: String? = nil) async throws -> YunleUsagePage {
        var input = ["action": "transactions"]
        if let cursor {
            guard cursor.range(of: "^offset:[0-9]{1,7}$", options: .regularExpression) != nil else { throw YunleAccountError.invalidResponse }
            input["cursor"] = cursor
        }
        let result = try await accountCall(input)
        let page = try JSONDecoder().decode(YunleUsagePage.self, from: JSONSerialization.data(withJSONObject: result))
        guard page.items.count <= 50, Set(page.items.map(\.id)).count == page.items.count,
              page.items.allSatisfy({ !$0.id.isEmpty && !$0.taskId.isEmpty && ["settle", "refund"].contains($0.type) && $0.createdAt > 0 && (-9_007_199_254_740_991...9_007_199_254_740_991).contains($0.chargedMicroPoints) && ($0.inputTokens ?? 0) >= 0 && ($0.outputTokens ?? 0) >= 0 }),
              page.nextCursor == nil || page.nextCursor!.range(of: "^offset:[0-9]{1,7}$", options: .regularExpression) != nil else { throw YunleAccountError.invalidResponse }
        return page
    }
    public func consumptionSummary() async throws -> YunleConsumptionSummary {
        let result = try await accountCall(["action": "summary"])
        let summary = try JSONDecoder().decode(YunleConsumptionSummary.self, from: JSONSerialization.data(withJSONObject: result))
        try summary.validate()
        return summary
    }
    public func logout() async throws {
        guard !operation, let saved = credentials else { throw YunleAccountError.signInRequired }
        operation = true
        defer { operation = false }
        let key = try P256.Signing.PrivateKey(rawRepresentation: saved.key)
        let result = try await call(Self.authURL, ["action": "revokeEntitlement", "deviceRefreshToken": saved.refreshToken], key: key)
        guard result["revoked"] as? Bool == true else { throw YunleAccountError.invalidResponse }
        try await storage.remove()
        epoch = UUID(); credentials = nil; pending = nil
    }
    private func accountCall(_ input: [String: String]) async throws -> [String: Any] {
        guard !operation, var saved = credentials else { throw YunleAccountError.signInRequired }
        operation = true
        defer { operation = false }
        let key = try P256.Signing.PrivateKey(rawRepresentation: saved.key)
        guard !saved.refreshPending else { throw YunleAccountError.refreshUncertain }
        if saved.expiresAt < Date().addingTimeInterval(60) {
            saved.refreshPending = true
            try await storage.save(JSONEncoder().encode(saved))
            credentials = saved
            let result = try await call(Self.authURL, ["action": "refreshEntitlement", "deviceRefreshToken": saved.refreshToken], key: key)
            let next = try received(result, key: key)
            guard next.userID == saved.userID else { throw YunleAccountError.invalidResponse }
            try await storage.save(JSONEncoder().encode(next))
            saved = next; credentials = next
        }
        return try await call(Self.accountURL, input, key: key, entitlement: saved.entitlement)
    }
    private func received(_ result: [String: Any], key: P256.Signing.PrivateKey) throws -> Credentials {
        guard let token = result["entitlement"] as? String, let refresh = result["deviceRefreshToken"] as? String, !refresh.isEmpty, refresh.count <= 4096 else { throw YunleAccountError.invalidResponse }
        let identity = try identity(token, key: key)
        return Credentials(key: key.rawRepresentation, entitlement: token, refreshToken: refresh, userID: identity.uid, expiresAt: identity.expiresAt, refreshPending: false)
    }
    func identity(_ token: String, key: P256.Signing.PrivateKey, allowExpired: Bool = false, now: Date = Date()) throws -> (uid: String, expiresAt: Date) {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard token.count <= 32000, parts.count == 3, let headerData = Data(yunleBase64URL: String(parts[0])), let claimsData = Data(yunleBase64URL: String(parts[1])), let sig = Data(yunleBase64URL: String(parts[2])),
              let header = try JSONSerialization.jsonObject(with: headerData) as? [String: Any], let claims = try JSONSerialization.jsonObject(with: claimsData) as? [String: Any],
              header["alg"] as? String == "EdDSA", header["typ"] as? String == "ylf-entitlement+jwt", let kid = header["kid"] as? String, let anchor = anchors[kid],
              try Curve25519.Signing.PublicKey(rawRepresentation: anchor).isValidSignature(sig, for: Data("\(parts[0]).\(parts[1])".utf8)),
              claims["iss"] as? String == "https://www.yunle.fun", claims["aud"] as? String == Self.clientID, claims["app_id"] as? String == "el-bot",
              let scopes = claims["scope"] as? [String], scopes.count == 2, Set(scopes) == ["membership:read", "ai:usage"],
              let uid = claims["sub"] as? String, uid != "anon", uid.range(of: "^[A-Za-z0-9_.:-]{1,256}$", options: .regularExpression) != nil,
              let grant = claims["grant_id"] as? String, !grant.isEmpty, grant.count <= 128,
              let jti = claims["jti"] as? String, !jti.isEmpty, jti.count <= 256,
              let iat = claims["iat"] as? Int64, let nbf = claims["nbf"] as? Int64, let exp = claims["exp"] as? Int64,
              iat <= Int64(now.timeIntervalSince1970), nbf <= Int64(now.timeIntervalSince1970), exp > iat, exp - iat <= 7 * 86400, allowExpired || exp > Int64(now.timeIntervalSince1970),
              let cnf = claims["cnf"] as? [String: Any], cnf["jkt"] as? String == thumbprint(key) else { throw YunleAccountError.invalidResponse }
        return (uid, Date(timeIntervalSince1970: Double(exp)))
    }
    private func call(_ url: URL, _ input: [String: Any], key: P256.Signing.PrivateKey, entitlement: String? = nil) async throws -> [String: Any] {
        let raw = try JSONSerialization.data(withJSONObject: input, options: [.sortedKeys, .withoutEscapingSlashes])
        let header = try JSONSerialization.data(withJSONObject: ["typ": "dpop+jwt", "alg": "ES256", "jwk": jwk(key)], options: [.sortedKeys, .withoutEscapingSlashes]).yunleBase64URL
        var claims: [String: Any] = ["htm": "POST", "htu": url.absoluteString, "iat": Int64(Date().timeIntervalSince1970), "jti": UUID().uuidString]
        if let entitlement { claims["ath"] = digest(Data(entitlement.utf8)); claims["request_hash"] = digest(raw) }
        let encoded = try JSONSerialization.data(withJSONObject: claims, options: [.sortedKeys, .withoutEscapingSlashes]).yunleBase64URL
        let unsigned = "\(header).\(encoded)"
        let proof = "\(unsigned).\(try key.signature(for: Data(unsigned.utf8)).rawRepresentation.yunleBase64URL)"
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(proof, forHTTPHeaderField: "DPoP")
        if let entitlement { request.setValue("DPoP \(entitlement)", forHTTPHeaderField: "Authorization") }
        request.httpBody = entitlement == nil ? raw : try JSONSerialization.data(withJSONObject: ["request": String(decoding: raw, as: UTF8.self)], options: [.withoutEscapingSlashes])
        let data = try await transport.send(request)
        guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw YunleAccountError.invalidResponse }
        if result["ok"] as? Bool == false || result["error"] != nil {
            let error = result["error"] as? [String: Any]
            throw YunleAccountError.service(error?["code"] as? String ?? result["code"] as? String ?? "REQUEST_FAILED")
        }
        return result["ok"] as? Bool == true ? (result["data"] as? [String: Any] ?? [:]) : result
    }
    private func jwk(_ key: P256.Signing.PrivateKey) -> [String: String] {
        let bytes = key.publicKey.x963Representation
        return ["crv": "P-256", "kty": "EC", "x": bytes.subdata(in: 1..<33).yunleBase64URL, "y": bytes.subdata(in: 33..<65).yunleBase64URL]
    }
    private func thumbprint(_ key: P256.Signing.PrivateKey) -> String {
        // RFC 7638 canonical key order is crv,kty,x,y.
        let value = jwk(key)
        return digest(Data("{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\"\(value["x"]!)\",\"y\":\"\(value["y"]!)\"}".utf8))
    }
    private func digest(_ value: Data) -> String { Data(SHA256.hash(data: value)).yunleBase64URL }
}
extension Data {
    init?(yunleBase64URL value: String) {
        var encoded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        self.init(base64Encoded: encoded)
    }
    var yunleBase64URL: String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}

func yunleServiceErrorCode(_ data: Data) -> String {
    let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    let nested = body?["error"] as? [String: Any]
    let code = nested?["code"] as? String ?? body?["code"] as? String
    guard let code, code.range(of: "^[A-Za-z0-9_-]{1,80}$", options: .regularExpression) != nil else { return "REQUEST_FAILED" }
    return code
}
