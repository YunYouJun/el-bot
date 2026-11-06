import AuthenticationServices
import CryptoKit
import Foundation
import YunCore

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

public struct AccountSSOConfigurationProvider: Sendable {
    public let issuer: String
    public let clientId: String
    public let redirectUri: String
    public let callbackScheme: String

    public init(bundle: Bundle = .main) {
        let values = bundle.infoDictionary ?? [:]
        issuer = values["YUN_SSO_ISSUER"] as? String ?? "https://www.yunle.fun"
        clientId = values["YUN_SSO_CLIENT_ID"] as? String ?? ""
        redirectUri = values["YUN_SSO_REDIRECT_URI"] as? String ?? ""
        callbackScheme = values["YUN_SSO_CALLBACK_SCHEME"] as? String ?? "yun"
    }

    public func configuration() throws -> AccountSSOConfiguration {
        guard let issuerURL = URL(string: issuer), let redirectURL = URL(string: redirectUri), !clientId.isEmpty
        else { throw AccountSSOError.notConfigured }
        return try AccountSSOConfiguration(issuer: issuerURL, clientId: clientId, redirectUri: redirectURL, callbackScheme: callbackScheme)
    }
}

public protocol AccountProofAdopting: Sendable {
    var configured: Bool { get }
    func proof(for callback: URL, request: AccountSSORequest, configuration: AccountSSOConfiguration) async throws -> AccountIdentityProof
}

public struct UnconfiguredAccountProofAdopter: AccountProofAdopting, Sendable {
    public init() {}
    public let configured = false
    public func proof(for callback: URL, request: AccountSSORequest, configuration: AccountSSOConfiguration) async throws -> AccountIdentityProof {
        throw AccountSSOError.notConfigured
    }
}

@MainActor
public final class WebAuthenticationSession: NSObject, ASWebAuthenticationPresentationContextProviding, AccountSSOAuthorizing {
    private var session: ASWebAuthenticationSession?
    public private(set) var pending: AccountSSORequest?
    public private(set) var configuration: AccountSSOConfiguration?

    public func begin(_ configuration: AccountSSOConfiguration) async throws -> URL {
        let nonce = Self.randomValue()
        let verifier = Self.randomValue()
        let request = try buildAccountSSORequest(configuration, nonce: nonce, codeVerifier: verifier)
        self.configuration = configuration
        pending = request
        let callback = try await start(request.url, callbackScheme: configuration.callbackScheme)
        _ = try parseAccountSSOCallback(callback, configuration: configuration, request: request)
        return callback
    }

    public func authorize(_ configuration: AccountSSOConfiguration) async throws -> URL {
        let callback = try await begin(configuration)
        pending = nil
        self.configuration = nil
        return callback
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        #if os(iOS)
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for scene in scenes where scene.activationState == .foregroundActive {
            if let window = scene.windows.first(where: \.isKeyWindow) { return window }
        }
        return ASPresentationAnchor()
        #elseif os(macOS)
        return NSApp.keyWindow ?? ASPresentationAnchor()
        #else
        return ASPresentationAnchor()
        #endif
    }

    private func start(_ url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { callback, error in
                if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: AccountSSOError.cancelled)
                }
                else if error != nil {
                    continuation.resume(throwing: AccountSSOError.unavailable)
                }
                else if let callback {
                    continuation.resume(returning: callback)
                }
                else {
                    continuation.resume(throwing: AccountSSOError.invalidResponse)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            self.session = session
            if !session.start() {
                self.session = nil
                continuation.resume(throwing: AccountSSOError.unavailable)
            }
        }
    }

    private static func randomValue() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
