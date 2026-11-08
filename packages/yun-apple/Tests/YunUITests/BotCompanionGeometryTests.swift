import CoreGraphics
import Testing
@testable import YunUI

@Suite("Bot companion gaze")
struct BotCompanionGeometryTests {
    @Test("Gaze follows the pointer relative to the mascot and returns to rest on exit")
    func pointerTracking() {
        let frame = CGRect(x: 200, y: 80, width: 400, height: 150)
        #expect(BotCompanionGeometry.gaze(pointer: CGPoint(x: 400, y: 155), frame: frame) == .zero)
        #expect(BotCompanionGeometry.gaze(pointer: CGPoint(x: 535, y: 255), frame: frame) == CGSize(width: 1, height: 1))
        #expect(BotCompanionGeometry.gaze(pointer: CGPoint(x: -1000, y: -1000), frame: frame) == CGSize(width: -1, height: -1))
        #expect(BotCompanionGeometry.gaze(pointer: nil, frame: frame) == .zero)
    }

    @Test("Resting eyes match the original artwork")
    func restingEyes() {
        let left = BotCompanionGeometry.eyeTransform(yaw: 0, pitch: 0, side: -1)
        let right = BotCompanionGeometry.eyeTransform(yaw: 0, pitch: 0, side: 1)
        #expect(abs(left.tx - 26.67) < 0.0001)
        #expect(abs(right.tx - 37.33) < 0.0001)
        #expect(abs(left.ty - 34.6) < 0.0001)
        #expect(abs(right.ty - 34.6) < 0.0001)
    }

    @Test("Turning the head shifts both eyes together and foreshortens the far eye")
    func sphericalProjection() {
        let yaw: CGFloat = 31 * .pi / 180
        let left = BotCompanionGeometry.eyeTransform(yaw: yaw, pitch: 0, side: -1)
        let right = BotCompanionGeometry.eyeTransform(yaw: yaw, pitch: 0, side: 1)
        #expect(left.tx > 26.67)
        #expect(right.tx > 37.33)
        #expect(right.a < left.a)
        let up = BotCompanionGeometry.eyeTransform(yaw: 0, pitch: 0.2, side: 1)
        #expect(up.ty < 34.6)
    }
}
