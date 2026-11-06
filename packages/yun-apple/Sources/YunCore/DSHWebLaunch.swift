import Foundation

public struct DSHWebLaunch: Decodable, Sendable {
    private let ticket: String
    public let expiresAt: Date
    public let launchUrl: URL

    public func request(for endpoint: Endpoint, now: Date = Date()) throws -> URLRequest {
        let expected = endpoint.origin.appendingPathComponent("el-bot/mobile/v1/web/launch")
        guard launchUrl == expected, ticket.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              expiresAt > now, expiresAt.timeIntervalSince(now) <= 65 else { throw CompanionError.invalidResponse }
        var request = URLRequest(url: expected)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(endpoint.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.httpBody = try JSONEncoder().encode(["ticket": ticket])
        return request
    }

    static func cookie(from response: HTTPURLResponse, for endpoint: Endpoint, now: Date = Date()) throws -> HTTPCookie {
        guard response.statusCode == 303,
              response.url == endpoint.origin.appendingPathComponent("el-bot/mobile/v1/web/launch"),
              response.value(forHTTPHeaderField: "Location") == "/",
              let header = response.value(forHTTPHeaderField: "Set-Cookie") else { throw CompanionError.invalidResponse }
        guard header.range(of: ";\\s*SameSite=Strict(?:;|$)", options: [.regularExpression, .caseInsensitive]) != nil,
              header.range(of: "(?:^|;)\\s*Domain\\s*=", options: [.regularExpression, .caseInsensitive]) == nil else {
            throw CompanionError.invalidResponse
        }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: endpoint.origin)
        guard cookies.count == 1, let cookie = cookies.first,
              cookie.name == "__Host-yun-dsh-web", cookie.domain == endpoint.origin.host,
              cookie.path == "/", cookie.isSecure, cookie.isHTTPOnly,
              cookie.value.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              let expires = cookie.expiresDate, expires > now,
              expires.timeIntervalSince(now) <= 7 * 24 * 60 * 60 + 60 else { throw CompanionError.invalidResponse }
        return cookie
    }
}
