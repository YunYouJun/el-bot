import Observation
import SwiftUI
import WebKit
import YunCore
import YunUI

struct MobileDSHWebView: View {
    let chat: ChatStore
    @Environment(\.yunStrings) private var text
    @AppStorage("dshWebAllowsPinchZoom") private var allowsPinchZoom = false
    @AppStorage("dshWebAllowsVerticalBounce") private var allowsVerticalBounce = false
    let controller: DSHWebController
    @State private var phone = PhoneControlStore()

    var body: some View {
        Group {
            if let api = chat.client, chat.device != nil {
                ZStack {
                    DSHWebSurface(webView: controller.webView)
                    if let error = controller.errorKey {
                        ContentUnavailableView {
                            Label(text["web.error.title"], systemImage: "network.slash")
                        } description: { Text(text[error]) } actions: {
                            Button(text["web.reconnect"]) { Task { await connect(api, force: true) } }
                        }.background(.background)
                    } else if controller.loading {
                        ProgressView(text["web.loading"]).padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                    }
                }
                .background(Color(uiColor: controller.surfaceBackground).ignoresSafeArea())
                .toolbar {
                    ToolbarItemGroup(placement: .topBarLeading) {
                        Button { controller.webView.goBack() } label: { Image(systemName: "chevron.left") }
                            .disabled(!controller.canGoBack).accessibilityLabel(text["web.back"])
                            .accessibilityIdentifier("dshWebBack")
                        Button { controller.webView.goForward() } label: { Image(systemName: "chevron.right") }
                            .disabled(!controller.canGoForward).accessibilityLabel(text["web.forward"])
                            .accessibilityIdentifier("dshWebForward")
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { controller.webView.reload() } label: { Image(systemName: "arrow.clockwise") }
                            .accessibilityLabel(text["refresh"])
                            .accessibilityIdentifier("dshWebReload")
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        if phone.channel != nil {
                            Button(text["phone.stop"]) { Task { await phone.disable(api) } }
                        } else {
                            Button { Task { await enablePhone(api) } } label: {
                                Label(text["phone.enable"], systemImage: "iphone.radiowaves.left.and.right")
                            }.disabled(phone.busy)
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Toggle(text["web.allowPinchZoom"], isOn: $allowsPinchZoom)
                                .accessibilityIdentifier("dshWebAllowsPinchZoom")
                            Toggle(text["web.allowVerticalBounce"], isOn: $allowsVerticalBounce)
                                .accessibilityIdentifier("dshWebAllowsVerticalBounce")
                            Divider()
                            Button(text["web.reconnect"]) { Task { await connect(api, force: true) } }
                                .accessibilityIdentifier("dshWebReconnect")
                            #if DEBUG
                            if ProcessInfo.processInfo.arguments.contains("--verify-dsh-web") {
                                Button("Verify navigation") { controller.verifyNavigation() }
                                    .accessibilityIdentifier("dshWebVerifyNavigation")
                            }
                            #endif
                        } label: {
                            Image(systemName: "gearshape")
                        }
                        .accessibilityLabel(text["web.settings"])
                        .accessibilityIdentifier("dshWebSettings")
                    }

                }
                #if DEBUG
                .overlay(alignment: .top) {
                    if ProcessInfo.processInfo.arguments.contains("--verify-dsh-web") {
                        Text(controller.verificationValue)
                            .font(.system(size: 8, design: .monospaced))
                            .padding(2).background(.background)
                            .accessibilityIdentifier("dshWebDiagnostics")
                            .allowsHitTesting(false)
                            .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
                            .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
                            .task {
                                while !Task.isCancelled {
                                    controller.sampleVerificationZoom()
                                    try? await Task.sleep(for: .milliseconds(200))
                                }
                            }
                    }
                }
                #endif
                .safeAreaInset(edge: .top, spacing: 0) {
                    if let channel = phone.channel {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Image(systemName: "iphone.radiowaves.left.and.right")
                                Text(text["phone.active"])
                                Spacer()
                                Text(channel.expiresAt, style: .timer).monospacedDigit()
                            }
                            Text(text["phone.detail"]).foregroundStyle(.secondary)
                        }.font(.caption).padding(8).background(.regularMaterial)
                    } else if let error = phone.errorKey {
                        Text(text[error]).font(.caption).padding(8)
                    }
                }
                .task(id: phone.channel?.sessionId) {
                    if phone.channel != nil { await phone.run(api) }
                }
            } else {
                ChatConnectionView(store: chat)
            }
        }
        .navigationTitle(text["web.title"])
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: allowsPinchZoom, initial: true) { _, value in
            controller.setAllowsPinchZoom(value)
        }
        .onChange(of: allowsVerticalBounce, initial: true) { _, value in
            controller.setAllowsVerticalBounce(value)
        }
        .task(id: chat.device?.id) {
            if phone.channel != nil { await phone.disable(nil) }
            if let api = chat.client, chat.device != nil { await connect(api) }
            else { await phone.disable(nil); controller.reset() }
        }
    }

    private func connect(_ api: MobileAPI, force: Bool = false) async {
        await controller.connect(api, force: force)
        if controller.errorKey == CompanionError.unauthorized.localizationKey { chat.handle(CompanionError.unauthorized) }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--phone-web-smoke"), phone.channel == nil {
            await enablePhone(api)
        }
        #endif
    }

    private func enablePhone(_ api: MobileAPI) async {
        await phone.enable(api)
        if let channel = phone.channel { controller.openPhoneSession(channel.sessionId) }
    }
}

private struct DSHWebSurface: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

@MainActor @Observable final class DSHWebController: NSObject, WKNavigationDelegate, WKUIDelegate {
    @ObservationIgnored let webView: WKWebView
    private(set) var loading = true
    private(set) var errorKey: String?
    private(set) var canGoBack = false
    private(set) var canGoForward = false
    private(set) var pageBackground: UIColor = .systemBackground
    private var origin: URL?
    private var generation = 0
    private var responseStatus = 0
    private var allowsPinchZoom = false
    private var allowsVerticalBounce = false
    @ObservationIgnored private let pinchBlocker = UIPinchGestureRecognizer()
    @ObservationIgnored private var webObservations: [NSKeyValueObservation] = []
    @ObservationIgnored private var clearing: Task<Void, Never>?
    #if DEBUG
    private var observedZoomScale: CGFloat = 1
    private var navigationCount = 0
    private var observedOffsetY: CGFloat = 0
    private var minimumObservedOffsetY: CGFloat = 0
    private var observedVerticalBounce = false
    func sampleVerificationZoom() {
        let scroll = webView.scrollView
        observedZoomScale = scroll.zoomScale
        observedOffsetY = scroll.contentOffset.y
        minimumObservedOffsetY = min(minimumObservedOffsetY, observedOffsetY)
        if #available(iOS 17.4, *) { observedVerticalBounce = scroll.bouncesVertically }
        else { observedVerticalBounce = scroll.bounces }
    }
    func verifyNavigation() {
        // Exercise real same-origin browser history without changing remote data.
        guard let url = webView.url, allowed(url), var target = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        target.fragment = "yun-webview-history-check"
        if let url = target.url { webView.load(URLRequest(url: url)) }
    }
    var verificationValue: String {
        "allowed=\(allowsPinchZoom);blocked=\(pinchBlocker.isEnabled);pinch=\(webView.scrollView.pinchGestureRecognizer?.isEnabled == true);zoom=\(observedZoomScale);loading=\(loading);status=\(responseStatus);navigation=\(navigationCount);bounce=\(allowsVerticalBounce);vertical=\(observedVerticalBounce);offsetY=\(observedOffsetY);minimumY=\(minimumObservedOffsetY)"
    }
    #endif
    private var phoneSession: String?
    private var smokeSubmitted = false
    private var phoneWebPhase = "idle"

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.ignoresViewportScaleLimits = true
        // Deliberately no script message handler, file access or native tool bridge.
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.accessibilityIdentifier = "dshWebView"
        // WebKit derives underPageBackgroundColor from the page and the web
        // view's base color. Without a system base it stays white until the
        // first paint, which shows up as a white flash in dark mode.
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        // A failure dependency survives WebKit re-enabling its own recognizer.
        pinchBlocker.cancelsTouchesInView = false
        webView.scrollView.addGestureRecognizer(pinchBlocker)
        applyPinchZoomPreference()
        applyVerticalBouncePreference()
        webObservations = [
            webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] _, _ in
                Task { @MainActor in self?.updateNavigationState() }
            },
            webView.observe(\.canGoForward, options: [.initial, .new]) { [weak self] _, _ in
                Task { @MainActor in self?.updateNavigationState() }
            },
            webView.observe(\.underPageBackgroundColor, options: [.initial, .new]) { [weak self] _, _ in
                Task { @MainActor in
                    guard let self else { return }
                    // There is no page-derived color before the first
                    // navigation; keep following the system appearance.
                    guard self.webView.url != nil else { return }
                    self.pageBackground = self.webView.underPageBackgroundColor ?? .systemBackground
                }
            },
        ]
    }

    var surfaceBackground: UIColor {
        guard !loading, webView.url != nil else { return .systemBackground }
        return pageBackground
    }

    private func updateNavigationState() {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
    }

    func setAllowsPinchZoom(_ allows: Bool) {
        allowsPinchZoom = allows
        applyPinchZoomPreference()
        if !allows {
            webView.scrollView.setZoomScale(webView.scrollView.minimumZoomScale, animated: false)
        }
    }

    func setAllowsVerticalBounce(_ allows: Bool) {
        allowsVerticalBounce = allows
        applyVerticalBouncePreference()
        #if DEBUG
        minimumObservedOffsetY = webView.scrollView.contentOffset.y
        #endif
    }

    private func applyVerticalBouncePreference() {
        let scroll = webView.scrollView
        // WKScrollView preserves the client bounces setting; viewport commits overwrite axis-specific setters.
        scroll.bounces = allowsVerticalBounce
        scroll.alwaysBounceVertical = allowsVerticalBounce
    }

    private func applyPinchZoomPreference() {
        pinchBlocker.isEnabled = !allowsPinchZoom
        if let pinch = webView.scrollView.pinchGestureRecognizer {
            pinch.require(toFail: pinchBlocker)
            pinch.isEnabled = allowsPinchZoom
        }
    }

    func connect(_ api: MobileAPI, force: Bool = false) async {
        if !force, origin == api.endpoint.origin, webView.url != nil, errorKey == nil { return }
        generation += 1
        let current = generation
        origin = api.endpoint.origin
        loading = true
        errorKey = nil
        webView.stopLoading()
        do {
            await clearing?.value
            try Task.checkCancellation()
            guard generation == current else { return }
            let cookie = try await api.webCookie()
            try Task.checkCancellation()
            guard generation == current else { return }
            await webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
            try Task.checkCancellation()
            guard generation == current else { return }
            webView.load(URLRequest(url: api.endpoint.origin))
        } catch {
            guard !Task.isCancelled, generation == current else { return }
            loading = false
            errorKey = (error as? CompanionError)?.localizationKey ?? "web.error.connection"
            writeReceipt(loaded: false, dshPage: false)
        }
    }

    func reset() {
        guard origin != nil else { return }
        generation += 1
        phoneSession = nil
        origin = nil
        webView.stopLoading()
        webView.loadHTMLString("", baseURL: nil)
        loading = false
        errorKey = nil
        let store = webView.configuration.websiteDataStore
        clearing = Task { @MainActor in
            await withCheckedContinuation { continuation in
                store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
                    continuation.resume()
                }
            }
        }
    }

    func openPhoneSession(_ sessionId: String) {
        guard let origin else { return }
        phoneSession = sessionId
        var target = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
        target.fragment = "yun-phone=" + sessionId
        webView.load(URLRequest(url: target.url!))
    }

    private func allowed(_ url: URL) -> Bool {
        guard let origin else { return false }
        return url.scheme == "https" && url.host == origin.host && url.port == origin.port
            && url.user == nil && url.password == nil
            && URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "token" }) != true
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        if origin == nil, url.absoluteString == "about:blank" { return .allow }
        if allowed(url) { return .allow }
        if navigationAction.navigationType == .linkActivated, ["https", "http"].contains(url.scheme) {
            _ = await UIApplication.shared.open(url)
        }
        return .cancel
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        if navigationResponse.isForMainFrame, let response = navigationResponse.response as? HTTPURLResponse {
            responseStatus = response.statusCode
            if response.statusCode >= 400 {
                errorKey = "web.error.connection"
                loading = false
                writeReceipt(loaded: false, dshPage: false)
                return .cancel
            }
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        applyPinchZoomPreference()
        applyVerticalBouncePreference()
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        loading = true
        #if DEBUG
        navigationCount += 1
        #endif
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        applyPinchZoomPreference()
        applyVerticalBouncePreference()
        loading = false
        updateNavigationState()
        #if DEBUG
        let current = generation
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            guard generation == current, let url = webView.url, allowed(url) else { return }
            let dsh = (try? await webView.evaluateJavaScript("Boolean(globalThis.__DSH_BOOT_READY__)")) as? Bool ?? false
            writeReceipt(loaded: true, dshPage: dsh)
            if dsh {
                if ProcessInfo.processInfo.arguments.contains("--phone-web-smoke"), let phoneSession, !smokeSubmitted {
                    smokeSubmitted = true
                    // Debug acceptance uses the real rendered composer and its submit action.
                    // It never calls the host prompt API or the runner directly.
                    let script = """
                    (() => {
                      if (document.documentElement.dataset.yunPhoneSession !== '\(phoneSession)') return 'waiting-session';
                      const editor = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
                      if (!editor) return 'waiting-composer';
                      editor.focus();
                      const prompt = '请调用 phone_open_app 打开我手机上的 Chrome，短暂停留后返回小云（return_to_yun=true）。只调用一次，不使用终端或其他工具，不重试。根据手机执行回执告诉我结果。';
                      if (editor instanceof HTMLTextAreaElement) {
                        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, prompt);
                        editor.dispatchEvent(new Event('input', {bubbles:true}));
                      } else {
                        document.execCommand('insertText', false, prompt);
                      }
                      return 'filled';
                    })()
                    """
                    // Session navigation may finish after the document bootstrap.
                    for _ in 0..<15 {
                        guard generation == current else { return }
                        let phase = (try? await webView.evaluateJavaScript(script)) as? String ?? "script-error"
                        phoneWebPhase = phase
                        writeReceipt(loaded: true, dshPage: dsh)
                        if phase == "filled" {
                            try? await Task.sleep(for: .milliseconds(500))
                            let submitted = try? await webView.evaluateJavaScript("""
                            (() => {
                              const editor = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
                              if (!editor) return false;
                              editor.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
                              return true;
                            })()
                            """)
                            _ = submitted
                            phoneWebPhase = "submitted"
                            writeReceipt(loaded: true, dshPage: dsh)
                            break
                        }
                        try? await Task.sleep(for: .seconds(1))
                    }
                }
                if let image = try? await webView.takeSnapshot(configuration: nil), let bytes = image.pngData() {
                    let path = URL.cachesDirectory.appendingPathComponent("dsh-web-preview.png")
                    try? bytes.write(to: path, options: [.atomic, .completeFileProtection])
                    try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
                }
            }
        }
        #endif
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) { failed(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) { failed(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { failed(URLError(.networkConnectionLost)) }

    private func failed(_ error: any Error) {
        if (error as? URLError)?.code == .cancelled { return }
        loading = false
        errorKey = "web.error.connection"
        writeReceipt(loaded: false, dshPage: false)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, allowed(url) { webView.load(navigationAction.request) }
        return nil
    }

    private func writeReceipt(loaded: Bool, dshPage: Bool) {
        #if DEBUG
        let value: DeviceToolJSON = .object([
            "loaded": .bool(loaded), "dsh_page": .bool(dshPage), "http_status": .number(Double(responseStatus)),
            "error": errorKey.map(DeviceToolJSON.string) ?? .null,
            "phone_web_phase": .string(phoneWebPhase),
            "phone_session": phoneSession.map(DeviceToolJSON.string) ?? .null,
        ])
        let path = URL.cachesDirectory.appendingPathComponent("dsh-web-verification.json")
        try? Data(value.formatted.utf8).write(to: path, options: [.atomic, .completeFileProtection])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
        #endif
    }
}
