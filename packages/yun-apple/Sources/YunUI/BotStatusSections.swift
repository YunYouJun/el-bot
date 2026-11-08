import SwiftUI
import YunCore

/// Status content shared by the iPhone status tab and the Mac status page.
/// Each platform keeps its companion hero above these sections.
public struct BotStatusSections: View {
    let store: ChatStore
    @Environment(\.yunStrings) private var text
    @State private var confirmRestart = false
    @State private var restartRequested = false
    @State private var restarting = false

    public init(store: ChatStore) {
        self.store = store
    }

    public var body: some View {
        Group {
            connectionSection
            controlSection
            RemoteHostSection(host: store.status?.host, online: store.online)
            RemoteEnvironmentSection(runtime: store.status?.runtime, online: store.online)
            activitySection
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
                Label(
                    text[store.online ? "status.service.connected" : "status.service.unreachable"],
                    systemImage: store.online ? "checkmark.circle.fill" : "exclamationmark.circle"
                )
                .labelStyle(.titleAndIcon)
                .foregroundStyle(store.online ? Color.green : Color.secondary)
            } label: {
                Label(text["status.service"], systemImage: "network")
            }
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
                } label: {
                    Label(text["status.connection.details"], systemImage: "info.circle")
                }
            }
            if let error = store.errorKey {
                Label(text[error], systemImage: "wifi.exclamationmark").foregroundStyle(.secondary)
            }
        } header: {
            Text(text["status.cloud"])
        }
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

    @ViewBuilder private var activitySection: some View {
        if !store.sessions.isEmpty {
            Section(text["status.activity"]) {
                statusRow(
                    "status.sessions",
                    symbol: "bubble.left.and.bubble.right",
                    value: String(store.sessions.count)
                )
                let running = store.sessions.filter(\.running).count
                if running > 0 {
                    statusRow("status.running", symbol: "bolt", value: String(running))
                }
            }
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
        } label: {
            Label(text[key], systemImage: symbol)
        }
    }
}

struct RemoteHostSection: View {
    let host: RemoteHostStatus?
    let online: Bool
    @Environment(\.yunStrings) private var text

    private var cached: Bool {
        !online || host.map { $0.stale || Date().timeIntervalSince($0.sampledAt) > 60 } == true
    }

    var body: some View {
        Section {
            if let host {
                metric(
                    "status.host.cpu",
                    symbol: "cpu",
                    percent: host.cpu.usagePercent,
                    detail: "\(host.cpu.count) " + text["status.host.cores"]
                )
                .accessibilityIdentifier("hostCPUUsage")
                metric(
                    "status.host.memory",
                    symbol: "memorychip",
                    percent: host.memory.usagePercent,
                    detail: capacity(host.memory.usedBytes, host.memory.totalBytes)
                )
                .accessibilityIdentifier("hostMemoryUsage")
                ForEach(host.disks, id: \.mountPoint) { disk in
                    metric(
                        "status.host.disk",
                        symbol: "internaldrive",
                        percent: disk.usagePercent,
                        detail: disk.mountPoint + " · " + capacity(disk.usedBytes, disk.totalBytes)
                    )
                    .accessibilityIdentifier("hostDiskUsage." + disk.mountPoint)
                }
                DisclosureGroup {
                    LabeledContent(text["status.remote.hostname"], value: host.hostname).textSelection(.enabled)
                    LabeledContent(text["status.host.sampled"]) { Text(host.sampledAt, style: .relative) }
                    LabeledContent(text["status.host.available"], value: bytes(host.memory.availableBytes))
                    ForEach(host.disks, id: \.mountPoint) { disk in
                        LabeledContent(
                            text["status.host.disk_available"] + " · " + disk.mountPoint,
                            value: bytes(disk.availableBytes)
                        )
                    }
                } label: {
                    Label(text["status.host.details"], systemImage: "info.circle")
                }
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
        } label: {
            Label(text[key], systemImage: symbol)
        }
    }

    private func bytes(_ value: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: value, countStyle: .binary)
    }

    private func capacity(_ used: Int64, _ total: Int64) -> String {
        bytes(used) + " / " + bytes(total)
    }
}

struct RemoteEnvironmentSection: View {
    let runtime: RemoteRuntimeStatus?
    let online: Bool
    @Environment(\.yunStrings) private var text

    var body: some View {
        Section {
            if let runtime {
                statusRow("status.remote.hostname", symbol: "server.rack", value: runtime.hostname)
                statusRow("status.remote.system", symbol: "desktopcomputer", value: runtime.platform + " · " + runtime.arch)
                statusRow("status.remote.uptime", symbol: "clock", value: uptime(runtime.uptimeSeconds))
                statusRow(
                    "status.remote.memory",
                    symbol: "memorychip",
                    value: ByteCountFormatter.string(fromByteCount: runtime.memoryRSSBytes, countStyle: .memory)
                )
                DisclosureGroup {
                    LabeledContent(text["status.remote.kernel"], value: runtime.release).textSelection(.enabled)
                    LabeledContent(text["status.remote.node"], value: runtime.nodeVersion)
                    LabeledContent(text["status.remote.cpus"], value: String(runtime.cpuCount))
                } label: {
                    Label(text["status.remote.details"], systemImage: "cpu")
                }
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
        } label: {
            Label(text[key], systemImage: symbol)
        }
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
