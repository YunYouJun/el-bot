import SwiftUI
import YunCore
import YunUI

struct MobileBotStatusView: View {
    let store: ChatStore
    @Environment(\.yunStrings) private var text
    @Environment(\.scenePhase) private var scenePhase
    @State private var scrollOffset: CGFloat = 0
    @State private var confirmRestart = false
    @State private var restartRequested = false
    @State private var restarting = false

    var body: some View {
        List {
            Section {
                BotCompanionHero(scrollOffset: scrollOffset)
                    .background {
                        GeometryReader { geometry in
                            Color.clear.preference(key: BotScrollOffset.self,
                                value: geometry.frame(in: .named("bot-status")).minY)
                        }
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets())
            }
            if store.client == nil {
                Section {
                    NavigationLink { ChatConnectionView(store: store) } label: {
                        Label(text["connect.title"], systemImage: "link")
                    }
                }
            } else {
                connectionSection
                controlSection
                RemoteHostSection(host: store.status?.host, online: store.online)
                remoteSection
                if !store.sessions.isEmpty {
                    Section(text["status.activity"]) {
                        statusRow("status.sessions", symbol: "bubble.left.and.bubble.right", value: String(store.sessions.count))
                        let running = store.sessions.filter(\.running).count
                        if running > 0 {
                            statusRow("status.running", symbol: "bolt", value: String(running))
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(12)
        .coordinateSpace(name: "bot-status")
        .onPreferenceChange(BotScrollOffset.self) { scrollOffset = $0 }
        .navigationTitle(text["tab.status"])
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink { MobilePersonasView(chat: store) } label: {
                    Label(text["personas"], systemImage: "person.crop.rectangle")
                }.accessibilityIdentifier("openPersonas")
            }
        }
        .refreshable { await store.refresh() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                await store.refresh()
                do { try await Task.sleep(for: .seconds(15)) }
                catch { return }
            }
        }
        .alert(text["status.restart.confirm"], isPresented: $confirmRestart) {
            Button(text["action.cancel"], role: .cancel) {}
            Button(text["status.restart.action"], role: .destructive) { requestRestart() }
        } message: {
            Text(text["status.restart.warning"])
        }
    }

    private var connectionSection: some View {
        Section {
            LabeledContent {
                Label(text[store.online ? "status.service.connected" : "status.service.unreachable"],
                      systemImage: store.online ? "checkmark.circle.fill" : "exclamationmark.circle")
                    .labelStyle(.titleAndIcon)
                    .foregroundStyle(store.online ? Color.green : Color.secondary)
            } label: { Label(text["status.service"], systemImage: "network") }
            statusRow("connect.server", symbol: "globe", value: store.client?.endpoint.origin.host() ?? "—")
            LabeledContent {
                Text(text["status." + (store.online ? (store.status?.state ?? "unknown") : "unknown")])
                    .foregroundStyle(.secondary)
            } label: {
                Label(store.status?.name ?? text["app.name"], systemImage: "antenna.radiowaves.left.and.right")
            }
            if let status = store.status {
                DisclosureGroup {
                    LabeledContent(text["status.app_id"], value: status.appId).textSelection(.enabled)
                    LabeledContent(text["status.checked"]) { Text(status.checkedAt, style: .relative) }
                } label: { Label(text["status.connection.details"], systemImage: "info.circle") }
            }
            if let error = store.errorKey {
                Label(text[error], systemImage: "wifi.exclamationmark").foregroundStyle(.secondary)
            }
        } header: { Text(text["status.cloud"]) }
    }

    private var remoteSection: some View {
        RemoteEnvironmentSection(runtime: store.status?.runtime, online: store.online)
    }

    private var controlSection: some View {
        Section {
            Button(role: .destructive) {
                confirmRestart = true
            } label: {
                HStack {
                    Label(text["status.restart"], systemImage: "arrow.clockwise")
                    Spacer()
                    if restarting { ProgressView().controlSize(.small) }
                }
            }
            .disabled(!store.online || restarting || store.busy)
            .accessibilityIdentifier("restartService")
            if restartRequested {
                Label(text["status.restart.requested"], systemImage: "clock.arrow.circlepath")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text(text["status.control"])
        } footer: {
            Text(text["status.restart.detail"])
        }
    }

    private func requestRestart() {
        guard !restarting else { return }
        restarting = true
        restartRequested = false
        Task {
            let accepted = await store.restartCloud()
            restarting = false
            restartRequested = accepted
        }
    }

    private func statusRow(_ key: String, symbol: String, value: String) -> some View {
        LabeledContent {
            Text(value).foregroundStyle(.secondary).multilineTextAlignment(.trailing).textSelection(.enabled)
        } label: { Label(text[key], systemImage: symbol) }
    }
}

private struct RemoteHostSection: View {
    let host: RemoteHostStatus?
    let online: Bool
    @Environment(\.yunStrings) private var text

    private var cached: Bool {
        !online || host.map { $0.stale || Date().timeIntervalSince($0.sampledAt) > 60 } == true
    }

    var body: some View {
        Section {
            if let host {
                metric("status.host.cpu", symbol: "cpu", percent: host.cpu.usagePercent,
                       detail: "\(host.cpu.count) " + text["status.host.cores"])
                    .accessibilityIdentifier("hostCPUUsage")
                metric("status.host.memory", symbol: "memorychip", percent: host.memory.usagePercent,
                       detail: capacity(host.memory.usedBytes, host.memory.totalBytes))
                    .accessibilityIdentifier("hostMemoryUsage")
                ForEach(host.disks, id: \.mountPoint) { disk in
                    metric("status.host.disk", symbol: "internaldrive", percent: disk.usagePercent,
                           detail: disk.mountPoint + " · " + capacity(disk.usedBytes, disk.totalBytes))
                        .accessibilityIdentifier("hostDiskUsage." + disk.mountPoint)
                }
                DisclosureGroup {
                    LabeledContent(text["status.remote.hostname"], value: host.hostname).textSelection(.enabled)
                    LabeledContent(text["status.host.sampled"]) { Text(host.sampledAt, style: .relative) }
                    LabeledContent(text["status.host.available"], value: bytes(host.memory.availableBytes))
                    ForEach(host.disks, id: \.mountPoint) { disk in
                        LabeledContent(text["status.host.disk_available"] + " · " + disk.mountPoint,
                                       value: bytes(disk.availableBytes))
                    }
                } label: { Label(text["status.host.details"], systemImage: "info.circle") }
            } else {
                Text(text[online ? "status.host.unavailable" : "status.host.waiting"])
                    .foregroundStyle(.secondary)
            }
        } header: {
            HStack {
                Text(text["status.host.title"])
                if host != nil && cached { Text(text["status.cached"]) }
            }
        } footer: {
            if let host {
                Text(text[cached ? "status.host.stale" : "status.host.scope"])
                Text(host.sampledAt, style: .relative)
            }
        }
    }

    private func metric(_ key: String, symbol: String, percent: Double, detail: String) -> some View {
        LabeledContent {
            VStack(alignment: .trailing, spacing: 3) {
                Text((percent / 100).formatted(.percent.precision(.fractionLength(1))))
                    .monospacedDigit()
                Text(detail).font(.caption)
            }
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.trailing)
        } label: { Label(text[key], systemImage: symbol) }
    }

    private func bytes(_ value: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: value, countStyle: .binary)
    }

    private func capacity(_ used: Int64, _ total: Int64) -> String {
        bytes(used) + " / " + bytes(total)
    }
}

private struct RemoteEnvironmentSection: View {
    let runtime: RemoteRuntimeStatus?
    let online: Bool
    @Environment(\.yunStrings) private var text

    var body: some View {
        Section {
            if let runtime {
                statusRow("status.remote.hostname", symbol: "server.rack", value: runtime.hostname)
                statusRow("status.remote.system", symbol: "desktopcomputer", value: runtime.platform + " · " + runtime.arch)
                statusRow("status.remote.uptime", symbol: "clock", value: uptime(runtime.uptimeSeconds))
                statusRow("status.remote.memory", symbol: "memorychip", value:
                    ByteCountFormatter.string(fromByteCount: runtime.memoryRSSBytes, countStyle: .memory))
                DisclosureGroup {
                    LabeledContent(text["status.remote.kernel"], value: runtime.release).textSelection(.enabled)
                    LabeledContent(text["status.remote.node"], value: runtime.nodeVersion)
                    LabeledContent(text["status.remote.cpus"], value: String(runtime.cpuCount))
                } label: { Label(text["status.remote.details"], systemImage: "cpu") }
            } else {
                Text(text[online ? "status.remote.unavailable" : "status.remote.waiting"])
                    .foregroundStyle(.secondary)
            }
        } header: {
            HStack {
                Text(text["status.remote.title"])
                if !online && runtime != nil {
                    Text(text["status.cached"])
                }
            }
        } footer: {
            if runtime != nil { Text(text["status.remote.scope"]) }
        }
    }

    private func statusRow(_ key: String, symbol: String, value: String) -> some View {
        LabeledContent {
            Text(value).foregroundStyle(.secondary).multilineTextAlignment(.trailing).textSelection(.enabled)
        } label: { Label(text[key], systemImage: symbol) }
    }

    private func uptime(_ seconds: TimeInterval) -> String {
        let formatter = DateComponentsFormatter()
        formatter.calendar = Calendar.current
        formatter.calendar?.locale = Locale(identifier: text.locale)
        formatter.allowedUnits = seconds >= 86400 ? [.day, .hour] : seconds >= 3600 ? [.hour, .minute] : [.minute, .second]
        formatter.unitsStyle = .abbreviated
        formatter.maximumUnitCount = 2
        return formatter.string(from: max(0, seconds)) ?? "—"
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
                .padding(.top, 4)
            GeometryReader { geometry in
                ZStack {
                    Circle().fill(Self.blue.opacity(0.06)).frame(width: 170, height: 170)
                    Circle().stroke(Self.blue.opacity(0.09), lineWidth: 1).frame(width: 210, height: 210)
                    Image(systemName: "sparkle").font(.system(size: 17)).foregroundStyle(Self.blue.opacity(0.45))
                        .offset(x: -88, y: -48)
                    Image(systemName: "sparkle").font(.system(size: 11)).foregroundStyle(Self.blue.opacity(0.3))
                        .offset(x: 87, y: 32)
                    Ellipse().fill(Self.blue.opacity(0.12)).frame(width: 110, height: 14)
                        .blur(radius: 6).offset(y: 72)
                    cloud
                        .frame(width: 180, height: 180)
                        .scaleEffect(reduceMotion ? 1 : (greeting ? 1.08 : 1))
                        .rotationEffect(.degrees(reduceMotion ? 0 : Double(touch.width * 0.045 + drift * 0.24)))
                        .offset(movement)
                }
                .scaleEffect(0.65)
                .frame(width: geometry.size.width, height: geometry.size.height)
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
            .frame(height: 112)
            Text(text[greeting ? "status.bot.hello" : "status.bot.title"])
                .font(.system(.title2, design: .rounded, weight: .bold))
                .contentTransition(.opacity)
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

#Preview("Remote runtime") {
    let status = try! MobileJSON.decoder().decode(BotStatus.self, from: Data(#"{"name":"Cloud","appId":"123","state":"online","checkedAt":"2026-11-07T00:00:00Z","runtime":{"hostname":"cloud-bot","platform":"linux","release":"6.8.0","arch":"arm64","nodeVersion":"v24.11.0","cpuCount":2,"uptimeSeconds":93600,"memoryRSSBytes":268435456}}"#.utf8))
    NavigationStack {
        List { RemoteEnvironmentSection(runtime: status.runtime, online: true) }
            .listStyle(.insetGrouped)
    }
}

#Preview("Unavailable runtime") {
    NavigationStack {
        List { RemoteEnvironmentSection(runtime: nil, online: false) }
            .listStyle(.insetGrouped)
    }
}
