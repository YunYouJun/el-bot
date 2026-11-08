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
            if let artwork = Self.artwork(for: personaID) {
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

    private static func artwork(for personaID: String?) -> Image? {
        guard let personaID else { return nil }
        let tokens = personaID
            .lowercased()
            .split { !$0.isLetter && !$0.isNumber }
            .map(String.init)
        if tokens.contains("xiaoyun") { return xiaoyun }
        if tokens.contains("dafeiyu") { return dafeiyu }
        return nil
    }

    private static func loadArtwork(named name: String) -> Image? {
        guard let url = Bundle.module.url(forResource: name, withExtension: "webp") else { return nil }
        #if os(iOS)
        guard let image = UIImage(contentsOfFile: url.path) else { return nil }
        return Image(uiImage: image)
        #elseif os(macOS)
        guard let image = NSImage(contentsOf: url) else { return nil }
        return Image(nsImage: image)
        #else
        return nil
        #endif
    }

    private static let xiaoyun = loadArtwork(named: "xiaoyun-avatar")
    private static let dafeiyu = loadArtwork(named: "dafeiyu-avatar")
}

#Preview("Persona artwork") {
    HStack(spacing: 16) {
        PersonaAvatar(personaID: "xiaoyun", size: 96)
        PersonaAvatar(personaID: "dafeiyu", size: 96)
        PersonaAvatar(personaID: "dsh-persona-dafeiyu", size: 96)
        PersonaAvatar(personaID: nil, size: 64)
        PersonaAvatar(personaID: "another-card")
    }.padding()
}
