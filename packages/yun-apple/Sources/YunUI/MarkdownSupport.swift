import Foundation

enum ChatMarkdownSupport {
    static func needsBlockRendering(_ value: String) -> Bool {
        if value.contains("![") || value.contains("```") || value.contains("~~~") { return true }
        let rawLines = value.split(separator: "\n", omittingEmptySubsequences: false)
        for (index, rawLine) in rawLines.enumerated() {
            if rawLine.hasPrefix("    ") { return true }
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty else { continue }
            if line.hasPrefix(">") || line.hasPrefix("|") || isTableDelimiter(line) { return true }
            if line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("+ ") { return true }
            if line == "---" || line == "***" || line == "___" { return true }
            if line.hasPrefix("#") {
                let hashes = line.prefix(while: { $0 == "#" }).count
                if hashes <= 6, line.dropFirst(hashes).first == " " { return true }
            }
            if index > 0,
               !rawLines[index - 1].trimmingCharacters(in: .whitespaces).isEmpty,
               line.count >= 2,
               line.allSatisfy({ $0 == "=" }) {
                return true
            }
            if let marker = line.firstIndex(where: { $0 == "." || $0 == ")" }),
               line[..<marker].allSatisfy(\.isNumber),
               line.index(after: marker) < line.endIndex,
               line[line.index(after: marker)] == " " {
                return true
            }
        }
        return false
    }

    private static func isTableDelimiter(_ line: String) -> Bool {
        guard line.contains("|") else { return false }
        let cells = line.split(separator: "|", omittingEmptySubsequences: false)
        guard cells.count >= 2 else { return false }
        var sawCell = false
        for (index, cell) in cells.enumerated() {
            let trimmed = cell.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                if index == 0 || index == cells.count - 1 { continue }
                return false
            }
            let core = trimmed.trimmingCharacters(in: CharacterSet(charactersIn: ":"))
            guard core.count >= 3, core.allSatisfy({ $0 == "-" }) else { return false }
            sawCell = true
        }
        return sawCell
    }
}
