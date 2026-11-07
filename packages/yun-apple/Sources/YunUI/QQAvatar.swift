import SwiftUI
import YunCore

struct QQAvatar: View {
    let appId: String?
    let openId: String?
    var name: String?
    var size: CGFloat = 28
    @State private var image: CGImage?
    @State private var failed = false

    private var url: URL? { QQAvatarURL.make(appId: appId, openId: openId) }

    nonisolated init(appId: String?, openId: String?, name: String? = nil, size: CGFloat = 28) {
        self.appId = appId
        self.openId = openId
        self.name = name
        self.size = size
    }

    var body: some View {
        ZStack {
            Circle().fill(Color.accentColor.opacity(0.12))
            if let image {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .scaledToFill()
            } else if failed || url == nil {
                fallback
            } else {
                ProgressView().controlSize(.mini)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
        .task(id: url) {
            image = nil
            failed = false
            guard let url else { return }
            do {
                let loaded = try await QQImageLoader.shared.load(url)
                try Task.checkCancellation()
                image = loaded
            } catch {
                if !Task.isCancelled { failed = true }
            }
        }
    }

    @ViewBuilder private var fallback: some View {
        if let initial = name?.trimmingCharacters(in: .whitespacesAndNewlines).first {
            Text(String(initial))
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(Color.accentColor)
        } else {
            QQPlatformIcon().padding(size * 0.24).opacity(0.8)
        }
    }
}
