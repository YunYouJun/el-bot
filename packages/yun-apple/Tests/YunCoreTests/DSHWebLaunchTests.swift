import Foundation
import Testing
@testable import YunCore

@Test func webLaunchKeepsTheTicketOutOfURLsAndRejectsAnotherOrigin() throws {
    let endpoint = try Endpoint("https://bot.example.test")
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    func launch(_ url: String, expires: Date) throws -> DSHWebLaunch {
        let bytes = try JSONSerialization.data(withJSONObject: [
            "ticket": String(repeating: "a", count: 43), "launchUrl": url, "expiresAt": expires.ISO8601Format(),
        ])
        return try MobileJSON.decoder().decode(DSHWebLaunch.self, from: bytes)
    }
    let value = try launch("https://bot.example.test/el-bot/mobile/v1/web/launch", expires: now.addingTimeInterval(60))
    let request = try value.request(for: endpoint, now: now)
    #expect(request.httpMethod == "POST")
    #expect(request.url?.query == nil)
    #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
    #expect(String(decoding: request.httpBody!, as: UTF8.self).contains(String(repeating: "a", count: 43)))
    let foreign = try launch("https://evil.example/el-bot/mobile/v1/web/launch", expires: now.addingTimeInterval(60))
    #expect(throws: CompanionError.invalidResponse) { try foreign.request(for: endpoint, now: now) }
    #expect(throws: CompanionError.invalidResponse) { try value.request(for: endpoint, now: now.addingTimeInterval(61)) }
}

@Test func webCookieRejectsRedirectsForeignDomainsAndScriptReadableCookies() throws {
    let endpoint = try Endpoint("https://bot.example.test")
    let url = endpoint.origin.appendingPathComponent("el-bot/mobile/v1/web/launch")
    let token = String(repeating: "a", count: 43)
    func response(_ cookie: String, location: String = "/") -> HTTPURLResponse {
        HTTPURLResponse(url: url, statusCode: 303, httpVersion: nil, headerFields: ["Set-Cookie": cookie, "Location": location])!
    }
    let valid = "__Host-yun-dsh-web=\(token); Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600"
    #expect(try DSHWebLaunch.cookie(from: response(valid), for: endpoint).isHTTPOnly)
    for invalid in [
        valid.replacingOccurrences(of: "; HttpOnly", with: ""),
        valid.replacingOccurrences(of: "; Secure", with: ""),
        valid + "; Domain=evil.example",
        valid + "; Domain=bot.example.test",
        valid.replacingOccurrences(of: "SameSite=Strict", with: "SameSite=Lax"),
        valid.replacingOccurrences(of: "Max-Age=3600", with: "Max-Age=0"),
    ] {
        #expect(throws: CompanionError.invalidResponse) { try DSHWebLaunch.cookie(from: response(invalid), for: endpoint) }
    }
    #expect(throws: CompanionError.invalidResponse) {
        try DSHWebLaunch.cookie(from: response(valid, location: "https://evil.example"), for: endpoint)
    }
}
