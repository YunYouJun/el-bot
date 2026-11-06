import SwiftUI
import YunCore
import YunUI

struct MobileDeviceToolsView: View {
    @Environment(\.yunStrings) private var text
    @Environment(\.openURL) private var openURL
    @State private var tools = DeviceToolsStore()
    @State private var action: Task<Void, Never>?
    @State private var confirmSmoke = false

    var body: some View {
        Form {
            Section {
                Label(text["tools.mode"], systemImage: "cloud.and.bolt")
                Text(text["tools.mode.detail"]).font(.footnote).foregroundStyle(.secondary)
            }
            Section(text["tools.device"]) {
                LabeledContent(text["tools.system"], value: tools.snapshot["system"].string ?? "—")
                LabeledContent(text["tools.battery"], value: tools.snapshot["battery_percent"].number.map { "\(Int($0.rounded()))%" } ?? "—")
                LabeledContent(text["tools.low_power"], value: tools.snapshot["low_power_mode"].bool.map { text[$0 ? "tools.on" : "tools.off"] } ?? "—")
                LabeledContent(text["tools.thermal"], value: text["tools.thermal." + (tools.snapshot["thermal_state"].string ?? "unknown")])
                LabeledContent(text["tools.storage"], value: tools.snapshot["available_storage_bytes"].number.map {
                    ByteCountFormatter.string(fromByteCount: Int64($0), countStyle: .file)
                } ?? "—")
                DisclosureGroup(text["tools.device.json"]) { payload(tools.snapshot.formatted) }
            }
            Section {
                LabeledContent(text["tools.controller"], value: connectionLabel)
                    .accessibilityIdentifier("deviceControllerStatus")
                if let status = tools.status {
                    LabeledContent(text["settings.version"], value: status.version)
                }
                Button { run(.refresh) } label: { Label(text["refresh"], systemImage: "arrow.clockwise") }
                    .accessibilityIdentifier("refreshDeviceTools")
                if tools.status?.paired != true {
                    Button { run(.pair) } label: { Label(text["tools.pair"], systemImage: "key") }
                        .disabled(tools.status == nil)
                        .accessibilityIdentifier("pairDeviceController")
                }
                Button { openURL(URL(string: "ictrl://start")!) } label: {
                    Label(text["tools.open_runner"], systemImage: "arrow.up.forward.app")
                }
                Link(text["tools.setup"], destination: URL(string: "https://github.com/OpenMinis/iCTRL#readme")!)
            } header: { Text(text["tools.cross_app"]) } footer: {
                Text(text[tools.operation == .pair ? "tools.pair.waiting" : "tools.controller.detail"])
            }
            .disabled(tools.busy)
            Section {
                Button { run(.read) } label: { Label(text["tools.read"], systemImage: "iphone.gen3.radiowaves.left.and.right") }
                    .accessibilityIdentifier("readDeviceInfo")
                Button { confirmSmoke = true } label: { Label(text["tools.smoke"], systemImage: "safari") }
                    .accessibilityIdentifier("runDeviceSmoke")
            } header: { Text(text["tools.try"]) } footer: { Text(text["tools.smoke.detail"]) }
                .disabled(tools.busy || tools.status?.paired != true)
            if tools.busy {
                Section {
                    ProgressView(text[tools.operation == .pair ? "tools.pair.waiting" : "pending"])
                    Button(text["action.cancel"], role: .cancel) { action?.cancel() }
                }
            }
            if let error = tools.errorKey {
                Section { Label(text[error], systemImage: "exclamationmark.circle").foregroundStyle(.secondary) }
            }
            if let report = tools.report {
                Section {
                    if let elapsed = tools.elapsed {
                        LabeledContent(text["tools.elapsed"], value: String(format: "%.1f s", elapsed))
                    }
                    payload(report)
                    Button(text["tools.clear"], role: .destructive) { tools.clearReport() }
                } header: { Text(text["tools.result"]) } footer: { Text(text["tools.result.detail"]) }
            }
        }
        .navigationTitle(text["tools.title"])
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await tools.perform(.refresh)
            #if DEBUG
            let arguments = ProcessInfo.processInfo.arguments
            if !Task.isCancelled, arguments.contains("--pair-device-controller"), tools.status?.paired == false {
                await tools.perform(.pair)
            }
            if !Task.isCancelled, arguments.contains("--device-smoke"), tools.status?.paired == true {
                await tools.perform(.smoke)
            }
            #endif
        }
        .onDisappear { action?.cancel() }
        .confirmationDialog(text["tools.smoke"], isPresented: $confirmSmoke, titleVisibility: .visible) {
            Button(text["tools.smoke.run"]) { run(.smoke) }
        } message: { Text(text["tools.smoke.detail"]) }
    }

    private var connectionLabel: String {
        guard let status = tools.status else { return text["tools.controller.offline"] }
        return text[status.paired ? "tools.controller.ready" : "tools.controller.unpaired"]
    }

    private func run(_ operation: DeviceToolsStore.Operation) {
        action?.cancel()
        action = Task { await tools.perform(operation) }
    }

    private func payload(_ value: String) -> some View {
        Text(value).font(.caption.monospaced()).textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
