import CoreGraphics
import Foundation

enum BotCompanionGeometry {
    static func gaze(pointer: CGPoint?, frame: CGRect) -> CGSize {
        guard let pointer else { return .zero }
        return CGSize(
            width: min(1, max(-1, (pointer.x - frame.midX) / 135)),
            height: min(1, max(-1, (pointer.y - frame.midY) / 100))
        )
    }

    // Project each eye and its tangent plane onto the same sphere as the web mascot.
    static func eyeTransform(yaw: CGFloat, pitch: CGFloat, side: CGFloat) -> CGAffineTransform {
        let radius: CGFloat = 19.2
        let split = asin(5.33 / radius) * side
        let sy = sin(yaw), cy = cos(yaw), sp = sin(pitch), cp = cos(pitch)
        let ss = sin(split), cs = cos(split)
        return CGAffineTransform(
            a: cy * cs - sy * cp * ss,
            b: sp * ss,
            c: sy * sp,
            d: cp,
            tx: 32 + radius * (sy * cp * cs + cy * ss),
            ty: 34.6 - radius * sp * cs
        )
    }
}
