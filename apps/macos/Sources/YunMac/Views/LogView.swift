import SwiftUI

struct LogView: View {
    let store: DesktopStore
    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            Text(store.state.logs.isEmpty ? store.text("noLogs") : store.state.logs)
                .font(.system(.body, design: .monospaced)).textSelection(.enabled)
                .padding().frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .toolbar {
            Button(store.text("refreshLogs")) { store.send("logs") }.disabled(store.disabled)
        }
        .safeAreaInset(edge: .bottom) {
            if !store.error.isEmpty { Text(store.error).foregroundStyle(.red).padding() }
        }
        .frame(minWidth: 500, minHeight: 300)
    }
}
