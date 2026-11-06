import SwiftUI

struct StatusView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.locale) private var locale

    private var stateKey: String { "status." + (store.online ? (store.status?.state ?? "unknown") : "unknown") }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 16) {
                        Image(systemName: "cloud.fill").font(.largeTitle).foregroundStyle(.tint)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(store.status?.name ?? String(localized: "app.name")).font(.title3.bold())
                            Label(LocalizedStringKey(stateKey), systemImage: store.online && store.status?.state == "online" ? "checkmark.circle.fill" : "circle.dashed")
                                .font(.subheadline).foregroundStyle(store.online && store.status?.state == "online" ? .green : .secondary)
                        }
                    }.padding(.vertical, 16)
                }
                Section("status.cloud") {
                    LabeledContent("connect.server", value: store.client?.endpoint.origin.host() ?? "—")
                    if let status = store.status {
                        LabeledContent("status.app_id", value: status.appId)
                        LabeledContent("status.checked") { Text(status.checkedAt, style: .relative) }
                    }
                    LabeledContent("status.sessions", value: String(store.sessions.count))
                }
                if let error = store.errorKey {
                    Section { Label(LocalizedStringKey(error), systemImage: "wifi.exclamationmark").foregroundStyle(.secondary) }
                }
                Section { Text("status.description").font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("tab.status")
            .refreshable { await store.refresh() }
            .task { await store.refresh() }
        }.id(locale.identifier)
    }
}
