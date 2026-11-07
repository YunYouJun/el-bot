import ImageIO
import MarkdownUI
import SwiftUI
import YunCore

struct GroupMessageContent: View {
    let message: GroupTransportMessage
    @Environment(\.yunStrings) private var text

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !message.text.isEmpty {
                if message.manual == true {
                    Text(verbatim: message.text).textSelection(.enabled)
                } else {
                    Markdown(QQMessageContent.markdown(message.text, senderID: message.senderId, senderName: message.senderName, text: text))
                        .markdownTheme(.basic)
                        .markdownTextStyle {
                            FontSize(16)
                            ForegroundColor(message.outgoing ? .white : .primary)
                        }
                        .markdownTextStyle(\.link) {
                            ForegroundColor(message.outgoing ? .white : .accentColor)
                            UnderlineStyle(.single)
                        }
                        .markdownBlockStyle(\.codeBlock) { configuration in
                            ScrollView(.horizontal) {
                                configuration.label.fixedSize(horizontal: true, vertical: false)
                                    .markdownTextStyle { FontFamilyVariant(.monospaced); FontSize(.em(0.9)) }
                                    .padding(10)
                            }
                            .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                            .markdownMargin(top: .zero, bottom: .em(0.5))
                        }
                        .markdownBlockStyle(\.table) { configuration in
                            ScrollView(.horizontal) { configuration.label.fixedSize(horizontal: true, vertical: false) }
                        }
                        .markdownImageProvider(QQMarkdownImages())
                        .markdownInlineImageProvider(QQMarkdownImages())
                        .environment(\.openURL, OpenURLAction { url in
                            ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? "") ? .systemAction : .discarded
                        })
                        .textSelection(.enabled)
                }
            }
            ForEach(Array((message.attachments ?? []).enumerated()), id: \.offset) { _, attachment in
                if let url = attachment.imageURL {
                    QQMessageImage(url: url)
                } else {
                    Label {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(text["qq.media." + attachment.kind])
                            if let name = attachment.name, !name.isEmpty { Text(verbatim: name).font(.caption) }
                            if attachment.kind == "image" { Text(text["qq.media.unavailable"]).font(.caption) }
                        }
                    } icon: {
                        Image(systemName: ["image": "photo", "voice": "waveform", "video": "video", "file": "doc"][attachment.kind] ?? "doc")
                    }
                    .textSelection(.enabled)
                }
            }
            if message.text.isEmpty && message.attachments?.isEmpty != false {
                Text(text[message.kind == "attachment" ? "qq.message.attachment" : "qq.message.text"])
            }
        }
        .font(.body)
        .foregroundStyle(message.outgoing ? Color.white : Color.primary)
    }
}

private struct QQMarkdownImages: ImageProvider, InlineImageProvider {
    func makeImage(url: URL?) -> some View { QQMessageImage(url: QQImageURL.parse(url?.absoluteString)) }
    func image(with url: URL, label: String) async throws -> Image {
        let image = try await QQImageLoader.shared.load(url)
        let scale = max(1, CGFloat(max(image.width, image.height)) / 120)
        return Image(decorative: image, scale: scale)
    }
}

private struct QQMessageImage: View {
    let url: URL?
    @State private var image: CGImage?
    @State private var failed = false
    @State private var attempt = 0
    @State private var preview: QQImageSelection?
    @Environment(\.yunStrings) private var text

    nonisolated init(url: URL?) { self.url = url }

    var body: some View {
        Group {
            if let image {
                Button { preview = QQImageSelection(image: image) } label: {
                    Image(decorative: image, scale: 1).resizable().scaledToFit()
                        .frame(maxWidth: 420, maxHeight: 320)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(text["qq.media.preview"])
                .accessibilityIdentifier("groupImagePreview")
            } else {
                VStack(spacing: 8) {
                    if failed || url == nil {
                        Label(text["qq.media.unavailable"], systemImage: "photo.badge.exclamationmark")
                            .font(.caption)
                        if url != nil { Button(text["qq.media.retry"]) { attempt += 1 }.font(.caption) }
                    } else { ProgressView().accessibilityLabel(text["qq.media.image"]) }
                }
                .frame(maxWidth: 320, minHeight: 120)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .task(id: "\(url?.absoluteString ?? ""):\(attempt)") {
            image = nil; failed = false
            guard let url else { return }
            do {
                let loaded = try await QQImageLoader.shared.load(url)
                try Task.checkCancellation()
                image = loaded
            } catch {
                if !Task.isCancelled { failed = true }
            }
        }
        .sheet(item: $preview) { selection in QQImagePreview(selection: selection) }
    }
}

private struct QQImageSelection: Identifiable {
    let id = UUID()
    let image: CGImage
}

private struct QQImagePreview: View {
    let selection: QQImageSelection
    @Environment(\.dismiss) private var dismiss
    @Environment(\.yunStrings) private var text
    var body: some View {
        NavigationStack {
            Image(decorative: selection.image, scale: 1).resizable().scaledToFit().padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .navigationTitle(text["qq.media.image"])
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(text["qq.media.close"]) { dismiss() } } }
        }
        .frame(minWidth: 300, minHeight: 300)
    }
}

/// No paired-device Bearer, cookies or local file access is shared with the image transport.
actor QQImageLoader {
    static let shared = QQImageLoader()
    private let session: URLSession
    private let cache = NSCache<NSURL, CGImage>()
    private var inflight: [URL: Task<CGImage, Error>] = [:]
    private let maxBytes = 12 * 1024 * 1024
    private nonisolated static let avatarLifetime: TimeInterval = 24 * 60 * 60
    private nonisolated static let avatarFileLimit = 500

    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 30
        configuration.httpMaximumConnectionsPerHost = 4
        session = URLSession(configuration: configuration, delegate: QQImageRedirects(), delegateQueue: nil)
        cache.totalCostLimit = 32 * 1024 * 1024
        Self.pruneAvatarCache()
    }

    func load(_ source: URL) async throws -> CGImage {
        guard let url = QQImageURL.parse(source.absoluteString) else { throw URLError(.unsupportedURL) }
        if let cached = cache.object(forKey: url as NSURL) { return cached }
        if let task = inflight[url] { return try await task.value }
        let task = Task { try await self.fetch(url) }
        inflight[url] = task
        defer { inflight[url] = nil }
        return try await task.value
    }

    private func fetch(_ url: URL) async throws -> CGImage {
        if isAvatar(url), let data = avatarData(url) {
            if let image = try? decode(data) {
                store(image, for: url)
                return image
            }
            if let file = avatarFile(url) { try? FileManager.default.removeItem(at: file) }
        }
        let data = try await download(url)
        let image = try decode(data)
        if isAvatar(url) { writeAvatar(data, for: url) }
        store(image, for: url)
        return image
    }

    private func download(_ url: URL) async throws -> Data {
        let (bytes, response) = try await session.bytes(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              response.mimeType?.hasPrefix("image/") == true || response.mimeType == "application/octet-stream",
              response.expectedContentLength <= maxBytes else { throw URLError(.badServerResponse) }
        var data = Data()
        for try await byte in bytes {
            guard data.count < maxBytes else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        try Task.checkCancellation()
        return data
    }

    private func decode(_ data: Data) throws -> CGImage {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Double,
              let height = properties[kCGImagePropertyPixelHeight] as? Double,
              width > 0, height > 0, width * height <= 40_000_000,
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1600,
              ] as CFDictionary) else { throw URLError(.cannotDecodeContentData) }
        return image
    }

    private func store(_ image: CGImage, for url: URL) {
        cache.setObject(image, forKey: url as NSURL, cost: image.bytesPerRow * image.height)
    }

    private func isAvatar(_ url: URL) -> Bool {
        url.host?.lowercased() == "q.qlogo.cn"
    }

    private nonisolated static var avatarDirectory: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("qq-avatars", isDirectory: true)
    }

    private func avatarFile(_ url: URL) -> URL? {
        guard let directory = Self.avatarDirectory else { return nil }
        let name = url.pathComponents.dropFirst().joined(separator: "-")
        guard !name.isEmpty, name.utf8.count <= 200 else { return nil }
        return directory.appendingPathComponent(name).appendingPathExtension("img")
    }

    private func avatarData(_ url: URL) -> Data? {
        guard let file = avatarFile(url),
              let values = try? file.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
              let modified = values.contentModificationDate,
              Date().timeIntervalSince(modified) < Self.avatarLifetime,
              let size = values.fileSize, size > 0, size <= 512 * 1024,
              let data = try? Data(contentsOf: file) else { return nil }
        return data
    }

    private func writeAvatar(_ data: Data, for url: URL) {
        guard data.count <= 512 * 1024, let file = avatarFile(url) else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: .atomic)
    }

    private nonisolated static func pruneAvatarCache() {
        guard let directory = avatarDirectory,
              let files = try? FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: [.contentModificationDateKey]
              ) else { return }
        let dated = files.compactMap { file -> (URL, Date)? in
            guard let date = try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            else { return nil }
            return (file, date)
        }.sorted { $0.1 < $1.1 }
        let stale = dated.filter { Date().timeIntervalSince($0.1) >= avatarLifetime }
        let overflow = Array(dated.dropFirst(max(0, dated.count - avatarFileLimit)))
        for (file, _) in stale + overflow {
            try? FileManager.default.removeItem(at: file)
        }
    }
}

private final class QQImageRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let url = request.url, url.scheme == "https", QQImageURL.parse(url.absoluteString) != nil else {
            completionHandler(nil); return
        }
        completionHandler(request)
    }
}
