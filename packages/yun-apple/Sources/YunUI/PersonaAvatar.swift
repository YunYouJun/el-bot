import SwiftUI

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Bundled artwork for known personas; unknown cards retain a neutral placeholder.
public struct PersonaAvatar: View {
    private let personaID: String?
    private let size: CGFloat

    public init(personaID: String?, size: CGFloat = 48) {
        self.personaID = personaID
        self.size = size
    }

    public var body: some View {
        Group {
            if personaID == "xiaoyun", let artwork = Self.xiaoyun {
                artwork.resizable().scaledToFill()
            } else {
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.44, weight: .medium))
                    .foregroundStyle(.tint)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.tint.opacity(0.1))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private static let xiaoyun: Image? = {
        guard let url = Bundle.module.url(forResource: "xiaoyun-avatar", withExtension: "webp") else { return nil }
        #if os(iOS)
        guard let image = UIImage(contentsOfFile: url.path) else { return nil }
        return Image(uiImage: image)
        #elseif os(macOS)
        guard let image = NSImage(contentsOf: url) else { return nil }
        return Image(nsImage: image)
        #else
        return nil
        #endif
    }()
}

#Preview("Persona artwork") {
    HStack(spacing: 16) {
        PersonaAvatar(personaID: "xiaoyun", size: 96)
        PersonaAvatar(personaID: nil, size: 64)
        PersonaAvatar(personaID: "another-card")
    }.padding()
}
