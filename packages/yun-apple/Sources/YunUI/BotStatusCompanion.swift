#if os(macOS)
import SwiftUI
import YunCore

struct BotStatusCompanion: View {
    static let coordinateSpace = "bot-status-pointer"
    let pointer: CGPoint?
    @Environment(\.yunStrings) private var text
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var blinking = false
    @State private var greeting = false

    private var animates: Bool { scenePhase == .active && !reduceMotion }
    private var blue: Color {
        colorScheme == .dark
            ? Color(red: 134 / 255, green: 182 / 255, blue: 220 / 255)
            : Color(red: 75 / 255, green: 134 / 255, blue: 200 / 255)
    }

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { geometry in
                let gaze = animates
                    ? BotCompanionGeometry.gaze(pointer: pointer, frame: geometry.frame(in: .named(Self.coordinateSpace)))
                    : .zero
                Button {
                    greeting = true
                } label: {
                    ZStack {
                        BotCompanionBody().fill(blue.gradient)
                            .shadow(color: blue.opacity(0.16), radius: 12, y: 8)
                        BotCompanionEyes(gaze: gaze, openness: blinking || greeting ? 0.12 : 1)
                            .fill(colorScheme == .dark ? Color(red: 11 / 255, green: 18 / 255, blue: 32 / 255) : .white)
                            .clipShape(BotCompanionBody())
                    }
                    .frame(width: 210, height: 210)
                    .scaleEffect(x: 1 - abs(gaze.width) * 0.035, y: greeting && animates ? 1.04 : 1)
                    .rotationEffect(.degrees(gaze.width * 4), anchor: UnitPoint(x: 0.5, y: 0.63))
                    .offset(x: gaze.width * 3, y: gaze.height * 2)
                    .animation(animates ? .spring(response: 0.32, dampingFraction: 0.75) : nil, value: gaze)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.12), value: blinking || greeting)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(text["status.bot.accessibility"])
                .accessibilityIdentifier("botCompanion")
                .frame(width: geometry.size.width, height: geometry.size.height)
            }
            .frame(height: 150)
            Text(text[greeting ? "status.bot.hello" : "status.bot.title"])
                .font(.system(.title2, design: .rounded, weight: .semibold))
                .contentTransition(.opacity)
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.18), value: greeting)
        }
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity)
        .task(id: greeting) {
            guard greeting else { return }
            do {
                try await Task.sleep(for: .milliseconds(1200))
                greeting = false
            } catch { }
        }
        .task(id: animates) {
            guard animates else { blinking = false; return }
            do {
                while !Task.isCancelled {
                    try await Task.sleep(for: .seconds(Double.random(in: 3.6...6.8)))
                    blinking = true
                    try await Task.sleep(for: .milliseconds(120))
                    blinking = false
                }
            } catch { blinking = false }
        }
    }
}

private struct BotCompanionEyes: Shape {
    var gaze: CGSize
    var openness: CGFloat
    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>, CGFloat> {
        get { AnimatablePair(AnimatablePair(gaze.width, gaze.height), openness) }
        set {
            gaze = CGSize(width: newValue.first.first, height: newValue.first.second)
            openness = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        let yaw = (7 + gaze.width * 31) * .pi / 180
        let pitch = (4 - gaze.height * 11) * .pi / 180
        let eye = Capsule().path(in: CGRect(x: -1.95, y: -4.68 * openness, width: 3.9, height: 9.36 * openness))
        var result = Path()
        for side in [CGFloat(-1), CGFloat(1)] {
            result.addPath(eye, transform: BotCompanionGeometry.eyeTransform(yaw: yaw, pitch: pitch, side: side))
        }
        return result.applying(CGAffineTransform(scaleX: rect.width / 64, y: rect.height / 64))
    }
}

// The body and face coordinates match assets/brand/el-bot-cloud.svg.
private struct BotCompanionBody: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 17.078261, y: 49.295652))
        path.addCurve(to: CGPoint(x: 15.452343, y: 27.259095),
                      control1: CGPoint(x: 2.6, y: 49.295652), control2: CGPoint(x: 2.0, y: 29.25))
        path.addCurve(to: CGPoint(x: 48.547657, y: 27.259095),
                      control1: CGPoint(x: 20.0, y: 10.52), control2: CGPoint(x: 44.0, y: 10.52))
        path.addCurve(to: CGPoint(x: 46.921739, y: 49.295652),
                      control1: CGPoint(x: 62.0, y: 29.25), control2: CGPoint(x: 61.4, y: 49.295652))
        path.closeSubpath()
        return path.applying(CGAffineTransform(scaleX: rect.width / 64, y: rect.height / 64))
    }
}

#Preview {
    Form {
        Section { BotStatusCompanion(pointer: nil).listRowBackground(Color.clear) }
    }
    .formStyle(.grouped)
    .frame(width: 600, height: 360)
}
#endif
