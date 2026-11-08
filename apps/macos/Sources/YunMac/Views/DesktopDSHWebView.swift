import SwiftUI
import WebKit
import YunCore

struct DesktopDSHWebView: View {
    let desktop: DesktopStore
    let chat: ChatStore
    let controller: DesktopDSHWebController

    var body: some View {
        Group {
            if let api = chat.client, chat.device != nil {
                ZStack {
                    if let webView = controller.webView {
                        DesktopDSHWebSurface(webView: webView)
                    }
                    if let error = controller.errorKey {
                        ContentUnavailableView {
                            Label(desktop.text("web.error.title"), systemImage: "network.slash")
                        } description: {
                            Text(desktop.text(error))
                        } actions: {
                            Button(desktop.text("web.reconnect")) { Task { await connect(api, force: true) } }
                        }.background(.background)
                    } else if controller.loading {
                        ProgressView(desktop.text("web.loading"))
                            .padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                            .accessibilityIdentifier("dshWebLoading")
                    }
                }
                .toolbar {
                    ToolbarItemGroup {
                        Button { controller.webView?.goBack() } label: {
                            Label(desktop.text("web.back"), systemImage: "chevron.left")
                        }.disabled(!controller.canGoBack).accessibilityIdentifier("dshWebBack")
                        Button { controller.webView?.goForward() } label: {
                            Label(desktop.text("web.forward"), systemImage: "chevron.right")
                        }.disabled(!controller.canGoForward).accessibilityIdentifier("dshWebForward")
                        Button {
                            if controller.errorKey != nil { Task { await connect(api, force: true) } }
                            else { controller.webView?.reload() }
                        } label: {
                            Label(desktop.text("refresh"), systemImage: "arrow.clockwise")
                        }.accessibilityIdentifier("dshWebReload")
                        Button { Task { await connect(api, force: true) } } label: {
                            Label(desktop.text("web.reconnect"), systemImage: "arrow.triangle.2.circlepath")
                        }.disabled(controller.loading).accessibilityIdentifier("dshWebReconnect")
                    }
                }
                .task(id: chat.device?.id) { await connect(api) }
            } else {
                NativeChatConnection(desktop: desktop, chat: chat)
            }
        }
        .navigationTitle(desktop.text("web.title"))
    }

    private func connect(_ api: MobileAPI, force: Bool = false) async {
        guard let deviceID = chat.device?.id else { return }
        await controller.connect(api, deviceID: deviceID, force: force)
    }
}

private struct DesktopDSHWebSurface: NSViewRepresentable {
    let webView: WKWebView
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
