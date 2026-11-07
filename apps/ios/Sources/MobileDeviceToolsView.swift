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
                LabeledContent {
                    Label(connectionLabel, systemImage: connectionSymbol)
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(tools.status?.paired == true ? Color.green : Color.secondary)
                } label: { Label(text["tools.controller"], systemImage: "iphone.radiowaves.left.and.right") }
                    .accessibilityIdentifier("deviceControllerStatus")
                if tools.status?.paired != true {
                    Button { run(.pair) } label: { Label(text["tools.pair"], systemImage: "key") }
                        .disabled(tools.busy || tools.status == nil)
                        .accessibilityIdentifier("pairDeviceController")
                }
                Button { openURL(URL(string: "ictrl://start")!) } label: {
                    Label(text["tools.open_runner"], systemImage: "arrow.up.forward.app")
                }
                .disabled(tools.busy)
                if tools.status?.paired != true {
                    Link(destination: URL(string: "https://github.com/OpenMinis/iCTRL#readme")!) {
                        Label(text["tools.setup"], systemImage: "book")
                    }
                }
            } header: { Text(text["tools.cross_app"]) } footer: {
                if tools.operation == .pair { Text(text["tools.pair.waiting"]) }
                else if tools.status?.paired != true { Text(text["tools.controller.detail"]) }
            }
            Section {
                Button { confirmSmoke = true } label: {
                    Label(text["tools.smoke"], systemImage: "safari")
                }
                .accessibilityIdentifier("runDeviceSmoke")
                .disabled(tools.busy || tools.status?.paired != true)
            } header: { Text(text["tools.try"]) }
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
                    NavigationLink {
                        Form {
                            if let elapsed = tools.elapsed {
                                LabeledContent(text["tools.elapsed"], value: String(format: "%.1f s", elapsed))
                            }
                            Section { payload(report) }
                        }
                        .navigationTitle(text["tools.result"])
                        .navigationBarTitleDisplayMode(.inline)
                    } label: {
                        Label(text["tools.result"], systemImage: "doc.text.magnifyingglass")
                    }
                    Button(text["tools.clear"], role: .destructive) { tools.clearReport() }
                } footer: { Text(text["tools.result.detail"]) }
            }
            Section {
                NavigationLink { diagnostics } label: {
                    Label(text["tools.diagnostics"], systemImage: "stethoscope")
                }
                .accessibilityIdentifier("deviceToolsDiagnostics")
            }
        }
        .navigationTitle(text["tools.title"])
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { run(.refresh) } label: { Label(text["refresh"], systemImage: "arrow.clockwise") }
                    .disabled(tools.busy)
                    .accessibilityIdentifier("refreshDeviceTools")
            }
        }
        .refreshable { await tools.perform(.refresh) }
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
        if tools.operation == .refresh { return text["pending"] }
        guard let status = tools.status else { return text["tools.controller.offline"] }
        return text[status.paired ? "tools.controller.ready" : "tools.controller.unpaired"]
    }

    private var connectionSymbol: String {
        if tools.status?.paired == true { return "checkmark.circle.fill" }
        return tools.status == nil ? "circle.dashed" : "key"
    }

    private var diagnostics: some View {
        Form {
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
            Section(text["tools.controller"]) {
                if let status = tools.status {
                    LabeledContent(text["settings.version"], value: status.version)
                }
                Button { run(.read) } label: { Label(text["tools.read"], systemImage: "info.circle") }
                    .disabled(tools.busy || tools.status?.paired != true)
                    .accessibilityIdentifier("readDeviceInfo")
                if tools.operation == .read { ProgressView(text["pending"]) }
                if let error = tools.errorKey {
                    Label(text[error], systemImage: "exclamationmark.circle").foregroundStyle(.secondary)
                }
                if let report = tools.report { DisclosureGroup(text["tools.result"]) { payload(report) } }
                Link(destination: URL(string: "https://github.com/OpenMinis/iCTRL#readme")!) {
                    Label(text["tools.setup"], systemImage: "book")
                }
            }
        }
        .navigationTitle(text["tools.diagnostics"])
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await tools.perform(.refresh) }
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
