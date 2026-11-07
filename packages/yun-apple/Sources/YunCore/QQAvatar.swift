import Foundation

/// Official bot OpenIDs resolve to a profile image through the QQ avatar CDN.
public enum QQAvatarURL {
    /// Sizes accepted by the QQ avatar CDN.
    public static let sizes = [0, 100, 640]

    public static func make(appId: String?, openId: String?, size: Int = 100) -> URL? {
        guard let appId, let openId, sizes.contains(size) else { return nil }
        let app = appId.trimmingCharacters(in: .whitespacesAndNewlines)
        let member = openId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !app.isEmpty, app.utf8.count <= 32, app.allSatisfy(isAppIDCharacter),
              !member.isEmpty, member.utf8.count <= 128, member.allSatisfy(isOpenIDCharacter) else {
            return nil
        }
        var components = URLComponents()
        components.scheme = "https"
        components.host = "q.qlogo.cn"
        components.path = "/qqapp/\(app)/\(member)/\(size)"
        guard let url = components.url, url.host == "q.qlogo.cn" else { return nil }
        return url
    }

    private static func isAppIDCharacter(_ character: Character) -> Bool {
        guard character.isASCII else { return false }
        return character.isLetter || character.isNumber
    }

    private static func isOpenIDCharacter(_ character: Character) -> Bool {
        isAppIDCharacter(character) || character == "-" || character == "_"
    }
}
