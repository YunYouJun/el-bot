import SwiftUI
import YunBotCore

struct ConnectionView: View {
    @Environment(AppStore.self) private var store
    @State private var server = ""
    @State private var code = ""
    @State private var name = UIDevice.current.model

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 12) {
                        Image(systemName: "cloud.fill")
                            .font(.system(size: 56)).foregroundStyle(.tint)
                            .accessibilityHidden(true)
                        Text("app.name").font(.largeTitle.bold())
                        Text("connect.subtitle").foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 24)
                }.listRowBackground(Color.clear)
                Section("connect.server") {
                    TextField("https://bot.example.com", text: $server)
                        .textContentType(.URL).keyboardType(.URL)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityIdentifier("serverURL")
                }
                Section {
                    TextField("ABCD-EFGH", text: $code)
                        .textContentType(.oneTimeCode)
                        .font(.body.monospaced()).keyboardType(.asciiCapable)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                        .accessibilityLabel("connect.code").accessibilityIdentifier("pairingCode")
                    TextField("connect.device", text: $name).textContentType(.nickname)
                } header: { Text("connect.code") } footer: { Text("connect.instructions") }
                Section {
                    Button {
                        Task { await store.pair(server: server, code: code, name: name) }
                    } label: {
                        HStack {
                            Spacer()
                            if store.busy { ProgressView().padding(.trailing, 6) }
                            Text("connect.action").fontWeight(.semibold)
                            Spacer()
                        }
                    }
                    .disabled(store.busy || code.trimmingCharacters(in: .whitespaces).isEmpty || (try? Endpoint(server)) == nil)
                    .accessibilityIdentifier("pairDevice")
                }
                if let error = store.errorKey {
                    Section { Label(LocalizedStringKey(error), systemImage: "exclamationmark.circle").foregroundStyle(.red) }
                }
                Section { Label("connect.security", systemImage: "lock.shield").font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("connect.title")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { if server.isEmpty { server = store.server } }
        }
    }
}
