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
    #if os(macOS)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pointer: CGPoint?
    @State private var showingConnection = false
    #endif
    public init(store: ChatStore) { self.store = store }
    public var body: some View {
        Group {
            #if os(macOS)
            Form {
                Section {
                    BotStatusCompanion(pointer: pointer)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
                if store.client == nil {
                    Section {
                        Button { showingConnection = true } label: {
                            Label(text["connect.title"], systemImage: "network")
                        }
                    }
                } else {
                    BotStatusSections(store: store)
                }
            }
            .formStyle(.grouped)
            .coordinateSpace(name: BotStatusCompanion.coordinateSpace)
            .onContinuousHover(coordinateSpace: .named(BotStatusCompanion.coordinateSpace)) { phase in
                guard !reduceMotion else { return }
                switch phase {
                case .active(let location): pointer = location
                case .ended: pointer = nil
                }
            }
            .onChange(of: reduceMotion) { _, _ in pointer = nil }
            .navigationTitle(text["tab.status"])
            .sheet(isPresented: $showingConnection) {
                NavigationStack {
                    ChatConnectionView(store: store)
                        .navigationTitle(text["connect.title"])
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button(text["done"]) { showingConnection = false }
                            }
                        }
                }
                .frame(minWidth: 440, minHeight: 420)
            }
            #else
            if store.client == nil {
                ChatConnectionView(store: store)
                    .navigationTitle(text["tab.status"])
            } else {
                Form {
                    BotStatusSections(store: store)
                }
                .formStyle(.grouped)
                .navigationTitle(text["tab.status"])
            }
            #endif
        }
        .refreshable { await store.refresh() }
        .task { await store.refresh() }
    }
}
