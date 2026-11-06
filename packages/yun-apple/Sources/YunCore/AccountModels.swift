import Foundation
import CryptoKit

public struct AccountProfile: Codable, Sendable, Equatable {
    public let userId: String
    public let handle: String?
    public let displayName: String?
    public let avatarUrl: String?
    public let linkedAt: Date

    public init(userId: String, handle: String?, displayName: String?, avatarUrl: String?, linkedAt: Date) {
        self.userId = userId
        self.handle = handle
        self.displayName = displayName
        self.avatarUrl = avatarUrl
        self.linkedAt = linkedAt
    }
}

public struct AccountPreferences: Codable, Sendable, Equatable {
    public var language: String
    public var updatedAt: Date

    public init(language: String, updatedAt: Date) {
        self.language = language
        self.updatedAt = updatedAt
    }

    public static func sanitize(_ value: AccountPreferences, now: Date = Date()) -> AccountPreferences {
        let language = value.language == "en" || value.language == "zh-Hans" || value.language.isEmpty ? value.language : ""
        return AccountPreferences(language: language, updatedAt: min(value.updatedAt, now))
    }
}

public struct AccountSyncState: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let linked: Bool
    public let profile: AccountProfile?
    public let preferences: AccountPreferences?
    public let discovery: AccountDiscoveryState?

    public init(
        enabled: Bool,
        linked: Bool,
        profile: AccountProfile?,
        preferences: AccountPreferences?,
        discovery: AccountDiscoveryState? = nil
    ) {
        self.enabled = enabled
        self.linked = linked
        self.profile = profile
        self.preferences = preferences
        self.discovery = discovery
    }
}

public struct AccountLinkResult: Codable, Sendable, Equatable {
    public let profile: AccountProfile
    public let preferences: AccountPreferences

    public init(profile: AccountProfile, preferences: AccountPreferences) {
        self.profile = profile
        self.preferences = preferences
    }
}

public struct AccountIdentityProof: Encodable, Sendable {
    public let accessToken: String
    public let identityAssertion: String
    public let nonce: String

    public init(accessToken: String, identityAssertion: String, nonce: String) {
        self.accessToken = accessToken
        self.identityAssertion = identityAssertion
        self.nonce = nonce
    }
}

public enum AccountSSOError: Error, Sendable, Equatable {
    case invalidConfiguration
    case cancelled
    case denied
    case invalidResponse
    case notConfigured
    case unauthorized
    case unavailable

    public var localizationKey: String {
        switch self {
        case .invalidConfiguration, .invalidResponse: "error.account_response"
        case .cancelled: "error.account_cancelled"
        case .denied: "error.account_denied"
        case .notConfigured: "error.account_not_configured"
        case .unauthorized: "error.account_unauthorized"
        case .unavailable: "error.unavailable"
        }
    }
}

public struct AccountSSOConfiguration: Sendable, Equatable {
    public let issuer: URL
    public let clientId: String
    public let redirectUri: URL
    public let scope: String
    public let callbackScheme: String

    public init(issuer: URL, clientId: String, redirectUri: URL, scope: String = "identity:bootstrap", callbackScheme: String? = nil) throws {
        guard issuer.scheme?.lowercased() == "https", issuer.host?.isEmpty == false,
              issuer.user == nil, issuer.password == nil,
              issuer.path.isEmpty || issuer.path == "/", issuer.query == nil, issuer.fragment == nil,
              !clientId.isEmpty, clientId.count <= 64,
              redirectUri.scheme?.lowercased() == "https", redirectUri.user == nil, redirectUri.password == nil,
              redirectUri.fragment == nil, !redirectUri.host!.isEmpty,
              scope == "identity:bootstrap"
        else { throw AccountSSOError.invalidConfiguration }
        let resolvedScheme = callbackScheme ?? URLComponents(url: redirectUri, resolvingAgainstBaseURL: false)?.scheme ?? ""
        guard !resolvedScheme.isEmpty, resolvedScheme.range(of: "^[a-z][a-z0-9+.-]*$", options: .regularExpression) != nil else {
            throw AccountSSOError.invalidConfiguration
        }
        self.issuer = issuer
        self.clientId = clientId
        self.redirectUri = redirectUri
        self.scope = scope
        self.callbackScheme = resolvedScheme
    }
}

public protocol AccountSSOAuthorizing: Sendable {
    func authorize(_ configuration: AccountSSOConfiguration) async throws -> URL
}

public struct AccountSSORequest: Sendable, Equatable {
    public let url: URL
    public let nonce: String
    public let codeVerifier: String

    public init(url: URL, nonce: String, codeVerifier: String) {
        self.url = url
        self.nonce = nonce
        self.codeVerifier = codeVerifier
    }
}

public struct AccountSSOAuthorization: Sendable, Equatable {
    public let code: String
    public let issuer: String
    public let nonce: String
    public let codeVerifier: String

    public init(code: String, issuer: String, nonce: String, codeVerifier: String) {
        self.code = code
        self.issuer = issuer
        self.nonce = nonce
        self.codeVerifier = codeVerifier
    }
}

public func buildAccountSSORequest(_ configuration: AccountSSOConfiguration, nonce: String, codeVerifier: String) throws -> AccountSSORequest {
    guard nonce.range(of: "^[A-Za-z0-9_-]{32,128}$", options: .regularExpression) != nil,
          codeVerifier.range(of: "^[A-Za-z0-9._~-]{43,128}$", options: .regularExpression) != nil,
          var components = URLComponents(url: configuration.issuer, resolvingAgainstBaseURL: false)
    else { throw AccountSSOError.invalidConfiguration }
    let challenge = Data(SHA256.hash(data: Data(codeVerifier.utf8))).base64URLEncodedString()
    components.path = "/auth/sso"
    components.queryItems = [
        URLQueryItem(name: "client_id", value: configuration.clientId),
        URLQueryItem(name: "redirect_uri", value: configuration.redirectUri.absoluteString),
        URLQueryItem(name: "scope", value: configuration.scope),
        URLQueryItem(name: "nonce", value: nonce),
        URLQueryItem(name: "code_challenge", value: challenge),
        URLQueryItem(name: "code_challenge_method", value: "S256"),
        URLQueryItem(name: "prompt", value: "consent"),
    ]
    guard let url = components.url else { throw AccountSSOError.invalidConfiguration }
    return AccountSSORequest(url: url, nonce: nonce, codeVerifier: codeVerifier)
}

public func parseAccountSSOCallback(
    _ url: URL, configuration: AccountSSOConfiguration, request: AccountSSORequest
) throws -> AccountSSOAuthorization {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          components.scheme == configuration.callbackScheme,
          components.user == nil, components.password == nil,
          components.host == configuration.redirectUri.host
    else { throw AccountSSOError.invalidResponse }
    let items = (url.absoluteString.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).dropFirst().first.map(String.init) ?? "")
        .split(separator: "&")
    var fields: [String: String] = [:]
    for item in items {
        let pair = item.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
        guard pair.count == 2, let key = pair.first, let raw = pair.last else { continue }
        fields[String(key)] = String(raw).removingPercentEncoding ?? String(raw)
    }
    guard let encoded = fields["ylf_sso"],
          let data = Data(base64URLEncoded: encoded),
          let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          payload["nonce"] as? String == request.nonce,
          payload["iss"] as? String == configuration.issuer.absoluteString
    else { throw AccountSSOError.invalidResponse }
    if payload["ok"] as? Bool == true,
       let code = payload["code"] as? String,
       code.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
       payload["ticket"] == nil, payload["session"] == nil,
       payload["access_token"] == nil, payload["refresh_token"] == nil {
        return AccountSSOAuthorization(code: code, issuer: configuration.issuer.absoluteString, nonce: request.nonce, codeVerifier: request.codeVerifier)
    }
    if payload["ok"] as? Bool == false, payload["reason"] as? String == "access_denied" {
        throw AccountSSOError.denied
    }
    throw AccountSSOError.invalidResponse
}

private extension Data {
    init?(base64URLEncoded value: String) {
        var normalized = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        normalized += String(repeating: "=", count: (4 - normalized.count % 4) % 4)
        self.init(base64Encoded: normalized)
    }

    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
