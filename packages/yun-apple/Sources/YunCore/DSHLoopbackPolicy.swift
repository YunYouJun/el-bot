import Foundation

/// A loopback request is authorized independently of the cloud Web credential.
struct DSHLoopbackPolicy: Sendable {
    let localOrigin: URL
    let upstreamOrigin: URL
    let localCookieName: String
    let localCookieValue: String
    let upstreamCookie: String

    enum Rejection: Error { case invalidRequest, forbidden, oversized }
    struct Request: Sendable {
        let header: Data
        let isWebSocket: Bool
        let isCallback: Bool
    }

    func request(_ data: Data) throws -> Request {
        guard let text = String(data: data, encoding: .utf8) else { throw Rejection.invalidRequest }
        let lines = text.components(separatedBy: "\r\n")
        let first = (lines.first ?? "").split(separator: " ", omittingEmptySubsequences: false)
        guard first.count == 3, first[2] == "HTTP/1.1", ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].contains(String(first[0])) else { throw Rejection.invalidRequest }
        let method = String(first[0]), path = String(first[1])
        guard path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("\\"), !path.contains("#"),
              let url = URL(string: path, relativeTo: localOrigin)?.absoluteURL,
              url.scheme == localOrigin.scheme, url.host == localOrigin.host, url.port == localOrigin.port else { throw Rejection.invalidRequest }
        var fields: [(String, String)] = []
        for line in lines.dropFirst() where !line.isEmpty {
            guard !line.hasPrefix(" "), !line.hasPrefix("\t"), let colon = line.firstIndex(of: ":") else { throw Rejection.invalidRequest }
            let name = String(line[..<colon]).lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            guard !name.isEmpty, name.utf8.allSatisfy({ (97...122).contains($0) || (48...57).contains($0) || $0 == 45 }),
                  !value.unicodeScalars.contains(where: { $0.value < 32 && $0.value != 9 || $0.value == 127 }) else { throw Rejection.invalidRequest }
            fields.append((name, value))
        }
        func values(_ name: String) -> [String] { fields.filter { $0.0 == name }.map(\.1) }
        guard values("host") == [authority(localOrigin)], values("content-length").count <= 1,
              values("transfer-encoding").count <= 1, values("expect").isEmpty else { throw Rejection.invalidRequest }
        if let length = values("content-length").first {
            guard !length.isEmpty, length.utf8.allSatisfy({ (48...57).contains($0) }), let size = Int(length), size <= 32 * 1024 * 1024 else { throw Rejection.oversized }
            guard values("transfer-encoding").isEmpty else { throw Rejection.invalidRequest }
        }
        if let encoding = values("transfer-encoding").first, encoding.lowercased() != "chunked" { throw Rejection.invalidRequest }
        let callback = method == "GET" && url.path == "/oauth/callback"
        if callback {
            guard values("transfer-encoding").isEmpty, values("content-length").allSatisfy({ $0 == "0" }) else { throw Rejection.invalidRequest }
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            for name in ["code", "state"] {
                let matches = query.filter { $0.name == name }
                guard matches.count == 1, let value = matches.first?.value, !value.isEmpty, value.utf8.count <= 4096,
                      !value.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }) else { throw Rejection.invalidRequest }
            }
        } else {
            let cookies = values("cookie").flatMap { $0.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) } }
            let matchingCookies = cookies.filter { $0.hasPrefix(localCookieName + "=") }
            guard matchingCookies.count == 1, equal(matchingCookies[0], localCookieName + "=" + localCookieValue),
                  values("origin").allSatisfy({ $0 == localOrigin.absoluteString }),
                  !values("sec-fetch-site").contains("cross-site") else { throw Rejection.forbidden }
        }
        let webSocket = values("upgrade").map { $0.lowercased() } == ["websocket"]
        guard !webSocket || (method == "GET" && url.path.hasPrefix("/api/") && !callback) else { throw Rejection.forbidden }
        let omitted: Set<String> = ["host", "cookie", "authorization", "proxy-authorization", "x-dsh-auth-token", "origin", "connection", "proxy-connection", "forwarded", "upgrade"]
        var output = ["\(method) \(path) HTTP/1.1", "Host: \(authority(upstreamOrigin))", "Cookie: \(upstreamCookie)"]
        for (name, value) in fields where !omitted.contains(name) && !name.hasPrefix("sec-fetch-") && !name.hasPrefix("x-forwarded-") {
            output.append("\(name): \(value)")
        }
        if !callback { output.append("Origin: \(upstreamOrigin.absoluteString)") }
        output.append(webSocket ? "Connection: Upgrade\r\nUpgrade: websocket" : "Connection: close")
        return Request(header: Data((output.joined(separator: "\r\n") + "\r\n\r\n").utf8), isWebSocket: webSocket, isCallback: callback)
    }

    func response(_ data: Data, callback: Bool = false) throws -> (header: Data, completedAuthorization: Bool, interim: Bool) {
        guard let text = String(data: data, encoding: .utf8) else { throw Rejection.invalidRequest }
        let lines = text.components(separatedBy: "\r\n")
        guard let first = lines.first, first.hasPrefix("HTTP/1."), let status = Int(first.split(separator: " ").dropFirst().first ?? "") else { throw Rejection.invalidRequest }
        var output = [first]
        var completed = false
        var locations: [URL] = []
        for line in lines.dropFirst() where !line.isEmpty {
            guard let colon = line.firstIndex(of: ":") else { throw Rejection.invalidRequest }
            let name = line[..<colon].lowercased()
            let value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
            if ["set-cookie", "strict-transport-security"].contains(name) { continue }
            if name == "location", let url = URL(string: value, relativeTo: upstreamOrigin)?.absoluteURL {
                locations.append(url)
                if url.scheme == upstreamOrigin.scheme && url.host == upstreamOrigin.host && url.port == upstreamOrigin.port {
                    var local = URLComponents(url: url, resolvingAgainstBaseURL: false)!
                    local.scheme = localOrigin.scheme; local.host = localOrigin.host; local.port = localOrigin.port
                    output.append("Location: \(local.url!.absoluteString)")
                    continue
                }
                completed = status == 302 && url.scheme == "https" && url.host == "platform.deepseek.com" && (url.port == nil || url.port == 443)
                    && url.path == "/dsh/authorized" && url.user == nil && url.password == nil && url.fragment == nil
            }
            output.append(line)
        }
        let interim = (100..<200).contains(status) && status != 101
        if callback && !interim {
            guard completed, locations.count == 1, let location = locations.first else { throw Rejection.forbidden }
            // The unauthenticated callback may only return a validated completion redirect, never a fallback page.
            let safe = "HTTP/1.1 302 Found\r\nLocation: \(location.absoluteString)\r\nContent-Length: 0\r\nConnection: close\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\n\r\n"
            return (Data(safe.utf8), true, false)
        }
        return (Data((output.joined(separator: "\r\n") + "\r\n\r\n").utf8), completed && locations.count == 1, interim)
    }

    private func authority(_ url: URL) -> String {
        (url.host ?? "") + (url.port.map { ":\($0)" } ?? "")
    }

    private func equal(_ lhs: String, _ rhs: String) -> Bool {
        let left = Array(lhs.utf8), right = Array(rhs.utf8)
        guard left.count == right.count else { return false }
        return zip(left, right).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
    }
}
