import Foundation

public enum QQImageURL {
    /// QQ attachment links may omit the scheme or use HTTP; always fetch over HTTPS.
    public static func parse(_ value: String?) -> URL? {
        guard let value, value.count <= 4096,
              var parts = URLComponents(string: value.hasPrefix("//") ? "https:" + value : value),
              ["https", "http"].contains(parts.scheme?.lowercased() ?? ""),
              parts.user == nil, parts.password == nil, parts.port == nil,
              let host = parts.host?.lowercased(),
              host.hasSuffix(".qpic.cn") || host == "q.qlogo.cn"
                || ["multimedia.nt.qq.com", "multimedia.nt.qq.com.cn"].contains(host) else { return nil }
        parts.scheme = "https"
        parts.fragment = nil
        return parts.url
    }
}

/// Render transport tags as passive content. This never invokes a QQ command or resolves local files.
public enum QQMessageContent {
    public static func markdown(_ source: String, senderID: String? = nil, senderName: String? = nil,
                                text: YunStrings = YunStrings()) -> String {
        guard source.contains("<") else { return source }
        // Keep code examples literal, including unfinished fenced blocks.
        var fence: Character?
        return source.components(separatedBy: "\n").map { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                let marker = trimmed.first!
                if fence == nil { fence = marker }
                else if fence == marker { fence = nil }
                return line
            }
            guard fence == nil else { return line }
            guard line.contains("<") else { return line }
            return replace(line, pattern: #"(`+[^`]*`+)|<qqbot-(at-user|at-everyone|cmd-input|cmd-enter)\b([^<>]*)/\s*>|<@!?([^<>]+)>|<(qqimg|qqvoice|qqvideo|qqfile)>([^<>]*)</\5>"#) { match, input in
                if match.range(at: 1).location != NSNotFound { return input.substring(with: match.range) }
                func group(_ index: Int) -> String {
                    match.range(at: index).location == NSNotFound ? "" : input.substring(with: match.range(at: index))
                }
                let tag = group(2).lowercased()
                let attributes = group(3)
                if tag == "at-everyone" || ["all", "everyone"].contains(group(4)) {
                    return "**" + escape("@" + text["qq.tag.everyone"]) + "**"
                }
                if tag == "at-user" || !group(4).isEmpty {
                    let id = attribute("id", in: attributes) ?? group(4)
                    let label = id == senderID ? senderName ?? String(id.prefix(12)) : String(id.prefix(12))
                    return "**" + escape("@" + (label.isEmpty ? text["qq.tag.member"] : label)) + "**"
                }
                if tag.hasPrefix("cmd-") {
                    let label = attribute("show", in: attributes) ?? attribute("text", in: attributes) ?? text["qq.tag.command"]
                    return "**" + escape(label.removingPercentEncoding ?? label) + "**"
                }
                let media = group(5).lowercased()
                if media == "qqimg", let url = QQImageURL.parse(group(6).trimmingCharacters(in: .whitespaces)) {
                    return "![" + text["qq.media.image"] + "](<" + url.absoluteString + ">)"
                }
                let kind = ["qqimg": "image", "qqvoice": "voice", "qqvideo": "video", "qqfile": "file"][media] ?? "file"
                return "**" + escape("[" + text["qq.media." + kind] + "]") + "**"
            }
        }.joined(separator: "\n")
    }

    private static func attribute(_ key: String, in value: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: "\\b" + key + #"\s*=\s*(?:"([^"]*)"|'([^']*)')"#, options: .caseInsensitive),
              let match = regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) else { return nil }
        let input = value as NSString
        let result = input.substring(with: match.range(at: match.range(at: 1).location == NSNotFound ? 2 : 1))
        return result.replacingOccurrences(of: "&quot;", with: "\"").replacingOccurrences(of: "&apos;", with: "'")
            .replacingOccurrences(of: "&lt;", with: "<").replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&amp;", with: "&")
    }

    private static func escape(_ value: String) -> String {
        value.reduce(into: "") { result, char in
            if #"\`*_{}[]<>()#+-.!|~"#.contains(char) { result.append("\\") }
            result.append(char)
        }
    }

    private static func replace(_ value: String, pattern: String, transform: (NSTextCheckingResult, NSString) -> String) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return value }
        let input = value as NSString
        let matches = regex.matches(in: value, range: NSRange(location: 0, length: input.length))
        var result = value
        for match in matches.reversed() {
            if let range = Range(match.range, in: result) { result.replaceSubrange(range, with: transform(match, input)) }
        }
        return result
    }
}
