import SwiftUI
import YunCore

public struct ChatConnectionView: View {
    @Bindable var store: ChatStore
    let pairThroughSSH: (() -> Void)?
    let sshEnabled: Bool
    @Environment(\.yunStrings) private var text
    @State private var code = ""
    @State private var name = ""
    @State private var confirmingDisconnect = false
    public init(store: ChatStore, pairThroughSSH: (() -> Void)? = nil, sshEnabled: Bool = true) {
        self.store = store; self.pairThroughSSH = pairThroughSSH; self.sshEnabled = sshEnabled
    }
    public var body: some View {
        Form {
            if let device = store.device {
                Section {
                    Label(device.name, systemImage: "checkmark.shield")
                    LabeledContent(text["connect.server"], value: store.server)
                    LabeledContent(text["settings.expires"]) { Text(device.expiresAt, style: .date) }
                    Button(text["settings.disconnect"], role: .destructive) { confirmingDisconnect = true }.disabled(store.busy)
                }
            } else {
                Section {
                    TextField(text["connect.server"], text: $store.server).autocorrectionDisabled()
                        .serverKeyboard()
                        .accessibilityIdentifier("serverURL")
                    TextField(text["connect.code"], text: $code).font(.body.monospaced()).autocorrectionDisabled()
                        .pairingKeyboard()
                        .textContentType(.oneTimeCode)
                        .onChange(of: code) { _, value in
                            let normalized = PairingCode.normalize(value)
                            if normalized.count > 8 { code = String(normalized.prefix(8)) }
                        }
                        .accessibilityIdentifier("pairingCode")
                    TextField(text["connect.device"], text: $name).accessibilityIdentifier("deviceName")
                    Button(text["connect.action"]) {
                        Task { await store.pair(server: store.server, code: code, name: name); if store.device != nil { code = "" } }
                    }.disabled(store.busy || PairingCode.normalize(code).range(of: "^[A-HJ-NP-Z2-9]{8}$", options: .regularExpression) == nil || (try? Endpoint(store.server)) == nil)
                        .keyboardShortcut(.defaultAction)
                        .accessibilityIdentifier("pairDevice")
                    if let pairThroughSSH { Button(text["connect.ssh"], action: pairThroughSSH).disabled(store.busy || !sshEnabled) }
                } header: { Text(text["connect.title"]) } footer: { Text(text["connect.instructions"]) }
                Section { Label(text["connect.security"], systemImage: "lock.shield").font(.footnote).foregroundStyle(.secondary) }
            }
            if store.busy { ProgressView() }
            if let error = store.errorKey { Label(text[error], systemImage: "exclamationmark.circle").foregroundStyle(.red) }
        }
        .formStyle(.grouped)
        .onAppear {
            #if os(macOS)
            name = Host.current().localizedName ?? "Mac"
            #else
            name = "iPhone / iPad"
            #endif
        }
        .confirmationDialog(text["settings.disconnect.title"], isPresented: $confirmingDisconnect, titleVisibility: .visible) {
            Button(text["settings.disconnect"], role: .destructive) { Task { await store.disconnect() } }
            Button(text["action.cancel"], role: .cancel) {}
        } message: { Text(text["settings.disconnect.detail"]) }
    }
}

private extension View {
    @ViewBuilder func pairingKeyboard() -> some View {
        #if os(iOS)
        self.keyboardType(.asciiCapable).textInputAutocapitalization(.characters)
        #else
        self
        #endif
    }
    @ViewBuilder func serverKeyboard() -> some View {
        #if os(iOS)
        self.keyboardType(.URL).textInputAutocapitalization(.never)
        #else
        self
        #endif
    }
}

public struct CloudBotStatusView: View {
    let store: ChatStore
    @Environment(\.yunStrings) private var text
    public init(store: ChatStore) { self.store = store }
    public var body: some View {
        Form {
            Section {
                Label(store.status?.name ?? text["app.name"], systemImage: "cloud.fill").font(.headline)
                Label(text["status." + (store.online ? (store.status?.state ?? "unknown") : "unknown")], systemImage: store.online && store.status?.state == "online" ? "checkmark.circle" : "circle.dashed")
                LabeledContent(text["connect.server"], value: store.client?.endpoint.origin.host() ?? "—")
                if let status = store.status {
                    LabeledContent(text["status.app_id"], value: status.appId)
                    LabeledContent(text["status.checked"]) { Text(status.checkedAt, style: .relative) }
                }
                LabeledContent(text["status.sessions"], value: String(store.sessions.count))
            }
            if let error = store.errorKey { Label(text[error], systemImage: "wifi.exclamationmark") }
            Section { Text(text["status.description"]).font(.footnote).foregroundStyle(.secondary) }
        }.formStyle(.grouped).navigationTitle(text["tab.status"])
            .refreshable { await store.refresh() }.task { await store.refresh() }
    }
}
