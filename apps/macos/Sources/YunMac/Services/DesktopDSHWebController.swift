import AppKit
import Observation
import WebKit
import YunCore

@MainActor @Observable final class DesktopDSHWebController: NSObject, WKNavigationDelegate, WKUIDelegate {
    private(set) var webView: WKWebView?
    private(set) var loading = false
    private(set) var errorKey: String?
    private(set) var canGoBack = false
    private(set) var canGoForward = false
    @ObservationIgnored private var origin: URL?
    @ObservationIgnored private var serverOrigin: URL?
    @ObservationIgnored private var proxy: DSHLoopbackProxy?
    @ObservationIgnored private var authorizationPopup: WKWebView?
    @ObservationIgnored private var observations: [NSKeyValueObservation] = []
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var deviceID: String?
    @ObservationIgnored private var stopping: Task<Void, Never>?

    private func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.allowsBackForwardNavigationGestures = true
        view.setAccessibilityIdentifier("dshWebView")
        observations = [
            view.observe(\.canGoBack, options: [.initial, .new]) { [weak self] _, _ in
                Task { @MainActor in self?.updateNavigationState() }
            },
            view.observe(\.canGoForward, options: [.initial, .new]) { [weak self] _, _ in
                Task { @MainActor in self?.updateNavigationState() }
            },
        ]
        return view
    }

    func connect(_ api: MobileAPI, deviceID: String, force: Bool = false) async {
        if !force, self.deviceID == deviceID, serverOrigin == api.endpoint.origin,
           proxy != nil, webView?.url != nil, errorKey == nil { return }
        generation += 1
        let current = generation
        let previousProxy = proxy
        let preferredPort = serverOrigin == api.endpoint.origin ? UInt16(exactly: origin?.port ?? 0) ?? 0 : 0
        proxy = nil
        origin = nil
        loading = true
        errorKey = nil
        closeAuthorizationPopup()
        webView?.stopLoading()
        if serverOrigin != api.endpoint.origin || self.deviceID != deviceID { clearWebView() }
        serverOrigin = api.endpoint.origin
        self.deviceID = deviceID
        do {
            await stopping?.value
            await previousProxy?.stop()
            try Task.checkCancellation()
            guard generation == current else { return }
            let cookie = try await api.webCookie()
            try Task.checkCancellation()
            guard generation == current else { return }
            var bridge = try makeProxy(origin: api.endpoint.origin, cookie: cookie, port: preferredPort)
            let local: DSHLoopbackSession
            do { local = try await bridge.start() }
            catch {
                guard preferredPort != 0 else { throw error }
                await bridge.stop()
                bridge = try makeProxy(origin: api.endpoint.origin, cookie: cookie, port: 0)
                local = try await bridge.start()
            }
            guard generation == current, !Task.isCancelled else { await bridge.stop(); return }
            proxy = bridge
            origin = local.origin
            let view = webView ?? makeWebView()
            webView = view
            await view.configuration.websiteDataStore.httpCookieStore.setCookie(try local.browserCookie())
            try Task.checkCancellation()
            guard generation == current else { return }
            view.load(URLRequest(url: local.origin))
        } catch {
            guard generation == current else { return }
            if Task.isCancelled {
                reset()
                return
            }
            loading = false
            errorKey = (error as? CompanionError)?.localizationKey ?? "web.error.connection"
            let failedProxy = proxy
            proxy = nil
            origin = nil
            await failedProxy?.stop()
        }
    }

    private func makeProxy(origin: URL, cookie: HTTPCookie, port: UInt16) throws -> DSHLoopbackProxy {
        try DSHLoopbackProxy(origin: origin, cookie: cookie, preferredPort: port) { [weak self] in
            Task { @MainActor in
                self?.closeAuthorizationPopup()
                self?.webView?.reload()
            }
        }
    }

    func reset() {
        generation += 1
        let previousProxy = proxy
        let previousStop = stopping
        proxy = nil
        origin = nil
        serverOrigin = nil
        deviceID = nil
        loading = false
        errorKey = nil
        closeAuthorizationPopup()
        clearWebView()
        stopping = Task {
            await previousStop?.value
            await previousProxy?.stop()
        }
    }

    func resetIfDeviceChanged(_ deviceID: String?) {
        if self.deviceID != deviceID { reset() }
    }

    private func clearWebView() {
        webView?.stopLoading()
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        webView = nil
        observations.removeAll()
        canGoBack = false
        canGoForward = false
    }

    private func updateNavigationState() {
        canGoBack = webView?.canGoBack == true
        canGoForward = webView?.canGoForward == true
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        if webView === authorizationPopup {
            if url.absoluteString == "about:blank" { return .allow }
            if DesktopWebNavigation.isAuthorization(url) { NSWorkspace.shared.open(url) }
            return .cancel
        }
        if DesktopWebNavigation.allows(url, origin: origin) { return .allow }
        if navigationAction.navigationType == .linkActivated, DesktopWebNavigation.isExternalLink(url) {
            NSWorkspace.shared.open(url)
        }
        return .cancel
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        guard webView === self.webView else { return .allow }
        if navigationResponse.isForMainFrame, let response = navigationResponse.response as? HTTPURLResponse,
           response.statusCode >= 400 {
            failed(URLError(.badServerResponse))
            return .cancel
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard webView === self.webView else { return }
        loading = true
        errorKey = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === self.webView else { return }
        loading = false
        updateNavigationState()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        if webView === self.webView { failed(error) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        if webView === self.webView { failed(error) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === self.webView { failed(URLError(.networkConnectionLost)) }
    }

    private func failed(_ error: any Error) {
        if (error as? URLError)?.code == .cancelled { return }
        loading = false
        errorKey = "web.error.connection"
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if url.absoluteString == "about:blank", navigationAction.sourceFrame.isMainFrame {
            closeAuthorizationPopup()
            let popup = WKWebView(frame: .zero, configuration: configuration)
            popup.navigationDelegate = self
            popup.uiDelegate = self
            authorizationPopup = popup
            return popup
        }
        if DesktopWebNavigation.isAuthorization(url) {
            NSWorkspace.shared.open(url)
        } else if DesktopWebNavigation.allows(url, origin: origin) {
            webView.load(navigationAction.request)
        } else if navigationAction.navigationType == .linkActivated, DesktopWebNavigation.isExternalLink(url) {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView === authorizationPopup { closeAuthorizationPopup() }
    }

    private func closeAuthorizationPopup() {
        authorizationPopup?.stopLoading()
        authorizationPopup?.navigationDelegate = nil
        authorizationPopup?.uiDelegate = nil
        authorizationPopup = nil
    }
}
