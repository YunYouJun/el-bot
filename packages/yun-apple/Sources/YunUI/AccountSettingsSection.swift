import SwiftUI
import YunCore

public struct AccountSettingsSection: View {
    @Bindable var account: AccountSyncStore
    let strings: YunStrings
    let language: String
    let deviceName: String
    let connect: ((PairingResult, String) async throws -> Void)?

    public init(
        account: AccountSyncStore,
        strings: YunStrings,
        language: String,
        deviceName: String = "iPhone / iPad",
        connect: ((PairingResult, String) async throws -> Void)? = nil
    ) {
        self.account = account
        self.strings = strings
        self.language = language
        self.deviceName = deviceName
        self.connect = connect
    }

    public var body: some View {
        Section {
            if account.canDiscover {
                Button(strings["account.discover"]) {
                    Task { await account.signInAndDiscover(language: language, deviceName: deviceName) }
                }.disabled(account.busy)
                ForEach(account.instances) { instance in
                    Button {
                        Task {
                            account.onConnected = connect
                            await account.connect(instance: instance, language: language, deviceName: deviceName)
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Label(instance.name, systemImage: "cloud.fill")
                            Text(instance.publicOrigin).font(.caption).foregroundStyle(.secondary)
                        }
                    }.disabled(account.busy || account.connectingInstanceId != nil || instance.enrollmentTicket == nil)
                }
                if let error = account.discoveryErrorKey {
                    Label(strings[error], systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.red)
                }
            }
            else if !account.state.enabled || !account.canLink {
                Label(strings["account.not_configured"], systemImage: "person.crop.circle.badge.questionmark")
                    .foregroundStyle(.secondary)
            }
            else if account.state.linked {
                if let profile = account.state.profile {
                    Label(profile.displayName ?? profile.handle ?? strings["account.linked"], systemImage: "checkmark.shield")
                }
                if let preferences = account.state.preferences {
                    LabeledContent(strings["account.last_sync"]) {
                        Text(preferences.updatedAt, style: .relative)
                    }
                }
                Button(strings["account.sync_now"]) { Task { await account.savePreferences(language: language) } }
                    .disabled(account.busy)
                Button(strings["account.unlink"], role: .destructive) { Task { await account.unlink() } }
                    .disabled(account.busy)
            }
            else {
                Button(strings["account.sign_in"]) { Task { await account.link(language: language) } }
                    .disabled(account.busy)
                Text(strings["account.hint"]).font(.footnote).foregroundStyle(.secondary)
            }
            if account.busy { ProgressView() }
            if let error = account.errorKey {
                Label(strings[error], systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.red)
            }
        } header: {
            Text(strings["account.title"])
        } footer: {
            if account.canDiscover { Text(strings["account.discovery_hint"]).font(.footnote) }
        }
    }
}
