import Foundation
import Testing
@testable import YunCore

@Test func accountSSORequestUsesPKCEAndExactRedirect() throws {
    let configuration = try AccountSSOConfiguration(
        issuer: URL(string: "https://www.yunle.fun")!,
        clientId: "yun-bot-ios",
        redirectUri: URL(string: "https://bot.yunle.fun/auth/callback?platform=native")!
    )
    let nonce = String(repeating: "n", count: 43)
    let verifier = String(repeating: "v", count: 43)
    let request = try buildAccountSSORequest(configuration, nonce: nonce, codeVerifier: verifier)
    let components = try #require(URLComponents(url: request.url, resolvingAgainstBaseURL: false))
    let values = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
    #expect(components.path == "/auth/sso")
    #expect(values["client_id"] == "yun-bot-ios")
    #expect(values["redirect_uri"] == configuration.redirectUri.absoluteString)
    #expect(values["scope"] == "identity:bootstrap")
    #expect(values["nonce"] == nonce)
    #expect(values["code_challenge_method"] == "S256")
    #expect(values["code_challenge"]?.count == 43)
}

@Test func accountSSOCallbackRejectsMismatchedIssuerAndLeakedTokens() throws {
    let configuration = try AccountSSOConfiguration(
        issuer: URL(string: "https://www.yunle.fun")!,
        clientId: "yun-bot-ios",
        redirectUri: URL(string: "https://bot.yunle.fun/auth/callback")!
    )
    let nonce = String(repeating: "n", count: 43)
    let verifier = String(repeating: "v", count: 43)
    let request = try buildAccountSSORequest(configuration, nonce: nonce, codeVerifier: verifier)
    let payload = ["ok": true, "code": String(repeating: "c", count: 43), "nonce": nonce, "iss": "https://other.test"] as [String: Any]
    let data = try JSONSerialization.data(withJSONObject: payload)
    let encoded = data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    let url = URL(string: "https://bot.yunle.fun/auth/callback#ylf_sso=\(encoded)")!
    #expect(throws: AccountSSOError.invalidResponse) { try parseAccountSSOCallback(url, configuration: configuration, request: request) }
}

@Test func accountPreferencesDropUnsupportedLanguage() {
    let value = AccountPreferences.sanitize(AccountPreferences(language: "fr-FR", updatedAt: .distantFuture))
    #expect(value.language.isEmpty)
    #expect(value.updatedAt < .distantFuture)
}
