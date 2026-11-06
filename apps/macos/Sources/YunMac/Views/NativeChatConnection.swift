import SwiftUI
import YunCore
import YunUI

struct NativeChatConnection: View {
    let desktop: DesktopStore
    let chat: ChatStore
    var body: some View {
        VStack {
            ChatConnectionView(store: chat, pairThroughSSH: { desktop.send("pairChat") }, sshEnabled: !desktop.disabled && !desktop.state.host.isEmpty)
            if chat.device != nil {
                GroupBox {
                    VStack(alignment: .leading, spacing: 10) {
                        Button(desktop.text("connect.phone")) { desktop.send("pairChat", "phone") }.disabled(desktop.disabled)
                        if let pairing = desktop.phonePairing {
                            Text(pairing.code).font(.title.monospaced()).textSelection(.enabled)
                            Text(pairing.expiresAt, style: .timer).font(.caption).foregroundStyle(.secondary)
                            Text(desktop.text("connect.instructions")).font(.caption).foregroundStyle(.secondary)
                            Button(desktop.text("connect.hide_code")) { desktop.phonePairing = nil }
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(6)
                }.padding(.horizontal).padding(.bottom)
            }
        }
            .task(id: desktop.phonePairing?.expiresAt) {
                guard let expiry = desktop.phonePairing?.expiresAt else { return }
                try? await Task.sleep(for: .seconds(max(0, expiry.timeIntervalSinceNow)))
                if !Task.isCancelled { desktop.phonePairing = nil }
            }
            .safeAreaInset(edge: .bottom) {
                ClientMessages(error: desktop.error, note: "", pending: desktop.state.pending, pendingLabel: desktop.text("pending"))
                    .padding(.horizontal)
            }
    }
}
