import SwiftUI
import YunUI

struct QuickActionsView: View {
    let store: DesktopStore
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            GroupBox {
                VStack(alignment: .leading, spacing: 14) {
                    Label(store.text("cloud"), systemImage: "cloud.fill").font(.title2)
                    Text(store.text("cloudDescription")).foregroundStyle(.secondary)
                    if !store.state.host.isEmpty {
                        Label(store.state.host, systemImage: "server.rack").font(.callout.monospaced())
                    }
                    HStack {
                        Button { store.send("openCloud") } label: {
                            Label(store.text("openCloud"), systemImage: "arrow.up.right.square")
                        }.buttonStyle(.borderedProminent).disabled(store.disabled || store.state.host.isEmpty)
                        SettingsLink { Text(store.text("configureCloud")) }
                    }
                }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
            }
            Text(store.text("programs")).font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 125), spacing: 12)], spacing: 12) {
                ForEach(store.state.programs) { program in
                    Button { store.send("openProgram", program.name) } label: {
                        VStack(spacing: 8) {
                            Image(nsImage: DesktopIntegration.icon(for: program))
                                .resizable().frame(width: 40, height: 40).accessibilityHidden(true)
                            Text(program.title)
                            if !DesktopIntegration.installed(program) {
                                Image(systemName: "questionmark.circle").foregroundStyle(.secondary)
                            }
                        }.frame(maxWidth: .infinity, minHeight: 86).padding(8)
                    }.buttonStyle(.bordered).disabled(store.disabled)
                        .help(program.action).accessibilityLabel(program.action)
                }
            }
            Divider()
            DisclosureGroup(isExpanded: Binding(get: { store.state.localExpanded }, set: { store.send("toggleLocal", String($0)) })) {
                LocalBotView(store: store).padding(.top, 14)
            } label: { Label(store.text("localBot"), systemImage: "desktopcomputer").font(.headline) }
            Text(store.text("closeHint")).font(.caption).foregroundStyle(.secondary)
        }
    }
}

private struct LocalBotView: View {
    let store: DesktopStore
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            LabeledContent(store.text("localBot"), value: store.state.phase)
            LabeledContent("QQ", value: store.state.qq)
            LabeledContent(store.state.agent, value: store.state.agentConnection)
            if !store.state.task.isEmpty { LabeledContent(store.text("task"), value: store.state.task) }
            HStack {
                Button(store.text("refresh")) { store.send("refreshStatus") }
                Button(store.text("start")) { store.send("start") }.disabled(store.state.phaseKey != "stopped")
                Button(store.text("stop")) { store.send("stop") }.disabled(!["running", "starting"].contains(store.state.phaseKey))
                Button(store.text("restart")) { store.send("restart") }.disabled(store.state.phaseKey != "running")
                Button(store.text("logs")) { openWindow(id: "logs") }
            }.disabled(store.disabled)
            Text(store.text("quitHint")).font(.caption).foregroundStyle(.secondary)
        }
    }
}
