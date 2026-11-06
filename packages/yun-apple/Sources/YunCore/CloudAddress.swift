import Foundation

public struct CloudAddress: Sendable, Equatable {
    public let url: URL
    public init(_ value: String) throws {
        guard let components = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              components.scheme?.lowercased() == "https",
              let host = components.host, !host.isEmpty,
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              let url = components.url else { throw InvalidAddress() }
        self.url = url
    }

    public var personasURL: URL {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.fragment = "el-bot-personas"
        return components.url!
    }

    public struct InvalidAddress: Error, Sendable {}
}
