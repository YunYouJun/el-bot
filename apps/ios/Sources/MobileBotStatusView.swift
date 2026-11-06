import SwiftUI
import YunCore
import YunUI

struct MobileBotStatusView: View {
    let store: ChatStore
    @Environment(\.yunStrings) private var text
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Color.clear.frame(height: 0)
                    .background {
                        GeometryReader { geometry in
                            Color.clear.preference(key: BotScrollOffset.self,
                                value: geometry.frame(in: .named("bot-status")).minY)
                        }
                    }
                BotCompanionHero(scrollOffset: scrollOffset)
                VStack(alignment: .leading, spacing: 18) {
                    Label(text["status.bot.connection"], systemImage: "antenna.radiowaves.left.and.right")
                        .font(.headline)
                    HStack {
                        Text(store.status?.name ?? text["app.name"])
                        Spacer()
                        Label(text["status." + (store.online ? (store.status?.state ?? "unknown") : "unknown")],
                              systemImage: store.online && store.status?.state == "online" ? "checkmark.circle.fill" : "circle.dashed")
                            .foregroundStyle(.secondary)
                    }
                    Divider()
                    LabeledContent(text["connect.server"], value: store.client?.endpoint.origin.host() ?? "—")
                    LabeledContent(text["status.sessions"], value: String(store.sessions.count))
                    if let status = store.status {
                        LabeledContent(text["status.app_id"], value: status.appId)
                        LabeledContent(text["status.checked"]) { Text(status.checkedAt, style: .relative) }
                    }
                    if let error = store.errorKey {
                        Label(text[error], systemImage: "wifi.exclamationmark").foregroundStyle(.secondary)
                    }
                }
                .font(.subheadline)
                .padding(22)
                .background(.background, in: RoundedRectangle(cornerRadius: 26))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: 600)
            .frame(maxWidth: .infinity)
        }
        .coordinateSpace(name: "bot-status")
        .onPreferenceChange(BotScrollOffset.self) { scrollOffset = $0 }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(text["tab.status"])
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refresh() }
        .task { await store.refresh() }
    }
}

private struct BotScrollOffset: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct BotCompanionHero: View {
    let scrollOffset: CGFloat
    static let blue = Color(red: 75 / 255, green: 134 / 255, blue: 200 / 255)
    @Environment(\.yunStrings) private var text
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var drift: CGFloat = 0
    @State private var touch: CGSize = .zero
    @State private var blinking = false
    @State private var greeting = false

    private var movement: CGSize {
        reduceMotion ? .zero : CGSize(width: touch.width * 0.18, height: touch.height * 0.14 + drift)
    }

    var body: some View {
        VStack(spacing: 12) {
            Text(text["status.bot.eyebrow"])
                .font(.caption.weight(.semibold)).tracking(3)
                .foregroundStyle(Self.blue)
                .padding(.top, 24)
            GeometryReader { geometry in
                ZStack {
                    Circle().fill(Self.blue.opacity(0.06)).frame(width: 238, height: 238)
                    Circle().stroke(Self.blue.opacity(0.09), lineWidth: 1).frame(width: 290, height: 290)
                    Image(systemName: "sparkle").font(.system(size: 17)).foregroundStyle(Self.blue.opacity(0.45))
                        .offset(x: -115, y: -66)
                    Image(systemName: "sparkle").font(.system(size: 11)).foregroundStyle(Self.blue.opacity(0.3))
                        .offset(x: 113, y: 42)
                    Ellipse().fill(Self.blue.opacity(0.12)).frame(width: 110, height: 14)
                        .blur(radius: 6).offset(y: 92)
                    cloud
                        .frame(width: 220, height: 220)
                        .scaleEffect(reduceMotion ? 1 : (greeting ? 1.08 : 1))
                        .rotationEffect(.degrees(reduceMotion ? 0 : Double(touch.width * 0.045 + drift * 0.24)))
                        .offset(movement)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .simultaneousGesture(DragGesture(minimumDistance: 8)
                    .onChanged { value in
                        let x = value.location.x - geometry.size.width / 2
                        let y = value.location.y - geometry.size.height / 2
                        withAnimation(.interactiveSpring(response: 0.3, dampingFraction: 0.72)) {
                            touch = CGSize(width: min(120, max(-120, x)), height: min(85, max(-85, y)))
                        }
                    }
                    .onEnded { _ in
                        withAnimation(.spring(response: 0.55, dampingFraction: 0.6)) { touch = .zero }
                    })
                .onTapGesture { greet() }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text["status.bot.accessibility"])
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { greet() }
                .accessibilityIdentifier("botCompanion")
            }
            .frame(height: 280)
            Text(text[greeting ? "status.bot.hello" : "status.bot.title"])
                .font(.system(.title, design: .rounded, weight: .bold))
                .contentTransition(.opacity)
            Text(text["status.bot.subtitle"])
                .font(.subheadline).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Label(text["status.bot.hint"], systemImage: "chevron.down")
                .font(.caption).foregroundStyle(.tertiary).padding(.top, 10)
        }
        .padding(.bottom, 12)
        .onChange(of: scrollOffset) { old, new in
            guard !reduceMotion else { return }
            withAnimation(.interactiveSpring(response: 0.28, dampingFraction: 0.68)) {
                drift = min(22, max(-22, (new - old) * 1.4))
            }
        }
        .task(id: scrollOffset) {
            do {
                try await Task.sleep(for: .milliseconds(160))
                withAnimation(.spring(response: 0.6, dampingFraction: 0.55)) { drift = 0 }
            } catch { }
        }
        .task(id: greeting) {
            guard greeting else { return }
            do {
                try await Task.sleep(for: .seconds(1.8))
                withAnimation(reduceMotion ? nil : .spring(response: 0.4)) { greeting = false }
            } catch { }
        }
        .task(id: scenePhase == .active && !reduceMotion) {
            guard scenePhase == .active, !reduceMotion else { return }
            do {
                while !Task.isCancelled {
                    try await Task.sleep(for: .seconds(3.6))
                    withAnimation(.easeInOut(duration: 0.1)) { blinking = true }
                    try await Task.sleep(for: .milliseconds(140))
                    withAnimation(.easeOut(duration: 0.15)) { blinking = false }
                }
            } catch { blinking = false }
        }
    }

    private var cloud: some View {
        GeometryReader { geometry in
            let unit = geometry.size.width / 64
            ZStack(alignment: .topLeading) {
                CloudBotBody().fill(Self.blue.gradient)
                    .shadow(color: Self.blue.opacity(0.2), radius: 16, y: 10)
                HStack(spacing: 6.76 * unit) {
                    eye(unit: unit)
                    eye(unit: unit)
                }
                .offset(x: 24.72 * unit + (reduceMotion ? 0 : touch.width * 0.035),
                        y: 29.92 * unit + (reduceMotion ? 0 : touch.height * 0.035 + drift * 0.15))
            }
        }
    }

    private func eye(unit: CGFloat) -> some View {
        Capsule().fill(.white).frame(width: 3.9 * unit, height: 9.36 * unit)
            .scaleEffect(y: blinking || greeting ? 0.18 : 1)
    }

    private func greet() {
        withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.5)) { greeting = true }
    }
}

// The three lobes and eye coordinates follow assets/brand/el-bot-cloud.svg.
private struct CloudBotBody: Shape {
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
    NavigationStack { MobileBotStatusView(store: ChatStore()) }
}
