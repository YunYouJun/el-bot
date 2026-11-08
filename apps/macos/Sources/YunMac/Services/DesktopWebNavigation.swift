import Foundation

enum DesktopWebNavigation {
    static func allows(_ url: URL, origin: URL?) -> Bool {
        guard let origin else { return url.absoluteString == "about:blank" }
        return url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
            && url.user == nil && url.password == nil
            && URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "token" }) != true
    }

    static func isAuthorization(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == "platform.deepseek.com" && (url.port == nil || url.port == 443)
            && url.path == "/dsh/authorize" && url.user == nil && url.password == nil && url.fragment == nil
    }

    static func isExternalLink(_ url: URL) -> Bool {
        ["https", "http"].contains(url.scheme) && url.host != nil && url.user == nil && url.password == nil
    }
}
