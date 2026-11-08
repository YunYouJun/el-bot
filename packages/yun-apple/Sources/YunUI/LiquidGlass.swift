import SwiftUI

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Uses the system window background on Mac and an ambient backdrop on iOS.
struct ChatBackdrop: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        #if os(macOS)
        Color.clear
        #else
        ZStack {
            #if os(iOS)
            Color(uiColor: .systemBackground)
            #elseif os(macOS)
            Color(nsColor: .windowBackgroundColor)
            #else
            Color.white
            #endif

            RadialGradient(
                colors: [
                    Color.accentColor.opacity(colorScheme == .dark ? 0.22 : 0.14),
                    Color.accentColor.opacity(0.04),
                    .clear,
                ],
                center: .topLeading,
                startRadius: 20,
                endRadius: 620
            )

            RadialGradient(
                colors: [
                    Color.orange.opacity(colorScheme == .dark ? 0.1 : 0.07),
                    .clear,
                ],
                center: .bottomTrailing,
                startRadius: 20,
                endRadius: 520
            )
        }
        .ignoresSafeArea()
        #endif
    }
}

extension View {
    /// Mac message content uses semantic fills, reserving glass for controls.
    /// iOS retains its existing glass treatment and older-system fallback.
    @ViewBuilder func chatContentSurface(
        tint: Color? = nil,
        shape: some Shape
    ) -> some View {
        #if os(macOS)
        background(tint ?? Color(nsColor: .controlBackgroundColor), in: shape)
        #else
        if #available(iOS 26, *) {
            if let tint {
                glassEffect(.regular.tint(tint), in: shape)
            } else {
                glassEffect(.regular, in: shape)
            }
        } else {
            background(.regularMaterial, in: shape)
        }
        #endif
    }
}
