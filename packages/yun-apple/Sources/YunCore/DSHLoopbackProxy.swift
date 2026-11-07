import Foundation
import Network
import Security

public struct DSHLoopbackSession: Sendable {
    public let origin: URL
    private let cookieName: String
    private let cookieValue: String

    init(origin: URL, cookieName: String, cookieValue: String) {
        self.origin = origin; self.cookieName = cookieName; self.cookieValue = cookieValue
    }

    public func browserCookie() throws -> HTTPCookie {
        let header = "\(cookieName)=\(cookieValue); Path=/; HttpOnly; SameSite=Strict"
        guard let cookie = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: origin).first,
              cookie.isHTTPOnly, !cookie.isSecure else { throw CompanionError.invalidResponse }
        return cookie
    }
}

/// A single-origin TLS tunnel. All mutable state is confined to `queue`.
public final class DSHLoopbackProxy: @unchecked Sendable {
    private let queue = DispatchQueue(label: "fun.yunle.dsh-loopback")
    private let upstream: URL
    private let cookie: String
    private let cookieName: String
    private let preferredPort: UInt16
    private let connectionFactory: @Sendable () -> NWConnection
    private let authorizationCompleted: @Sendable () -> Void
    private var listener: NWListener?
    private var pipes: [UUID: DSHLoopbackPipe] = [:]
    private var starting: CheckedContinuation<DSHLoopbackSession, any Error>?
    private var stopping: [CheckedContinuation<Void, Never>] = []

    public convenience init(origin: URL, cookie: HTTPCookie, preferredPort: UInt16 = 0,
                            authorizationCompleted: @escaping @Sendable () -> Void = {}) throws {
        guard origin.scheme == "https", let host = origin.host, origin.user == nil, origin.password == nil,
              origin.query == nil, origin.fragment == nil, origin.path.isEmpty || origin.path == "/",
              cookie.name == "__Host-yun-dsh-web", cookie.domain == host, cookie.isSecure, cookie.isHTTPOnly,
              cookie.value.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              let port = NWEndpoint.Port(rawValue: UInt16(origin.port ?? 443)) else { throw CompanionError.invalidResponse }
        self.init(origin: origin, upstreamCookie: cookie.name + "=" + cookie.value, preferredPort: preferredPort,
                  connectionFactory: { NWConnection(host: NWEndpoint.Host(host), port: port, using: .tls) },
                  authorizationCompleted: authorizationCompleted)
    }

    // Internal transport injection lets tests exercise streaming without weakening production TLS.
    init(origin: URL, upstreamCookie: String, preferredPort: UInt16 = 0,
         connectionFactory: @escaping @Sendable () -> NWConnection,
         authorizationCompleted: @escaping @Sendable () -> Void = {}) {
        upstream = origin; cookie = upstreamCookie; self.preferredPort = preferredPort
        cookieName = "yun_dsh_loopback"
        self.connectionFactory = connectionFactory
        self.authorizationCompleted = authorizationCompleted
    }

    public func start() async throws -> DSHLoopbackSession {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard self.listener == nil else { continuation.resume(throwing: CompanionError.invalidResponse); return }
                do {
                    var bytes = [UInt8](repeating: 0, count: 32)
                    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw CompanionError.invalidResponse }
                    let token = Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
                    let parameters = NWParameters.tcp
                    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: self.preferredPort)!)
                    let listener = try NWListener(using: parameters)
                    self.listener = listener; self.starting = continuation
                    listener.newConnectionHandler = { [weak self, weak listener] local in
                        guard let self, let port = listener?.port, self.pipes.count < 64 else { local.cancel(); return }
                        let origin = URL(string: "http://127.0.0.1:\(port.rawValue)")!
                        let policy = DSHLoopbackPolicy(localOrigin: origin, upstreamOrigin: self.upstream,
                                                       localCookieName: self.cookieName, localCookieValue: token, upstreamCookie: self.cookie)
                        let id = UUID()
                        let pipe = DSHLoopbackPipe(local: local, policy: policy, queue: self.queue,
                                                  upstream: self.connectionFactory(), completed: self.authorizationCompleted) { [weak self] in
                            self?.pipes.removeValue(forKey: id)
                        }
                        self.pipes[id] = pipe
                        pipe.start()
                    }
                    listener.stateUpdateHandler = { [weak self, weak listener] state in
                        guard let self, let listener else { return }
                        switch state {
                        case .ready:
                            guard let port = listener.port else { self.failStart(); return }
                            let origin = URL(string: "http://127.0.0.1:\(port.rawValue)")!
                            self.starting?.resume(returning: DSHLoopbackSession(origin: origin, cookieName: self.cookieName, cookieValue: token))
                            self.starting = nil
                        case .failed:
                            self.failStart()
                            listener.cancel()
                        case .cancelled:
                            self.failStart()
                            self.listener = nil
                            self.stopping.forEach { $0.resume() }
                            self.stopping.removeAll()
                        default: break
                        }
                    }
                    listener.start(queue: self.queue)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    public func stop() async {
        await withCheckedContinuation { continuation in
            queue.async {
                Array(self.pipes.values).forEach { $0.close() }
                self.pipes.removeAll()
                guard let listener = self.listener else { continuation.resume(); return }
                self.stopping.append(continuation)
                listener.cancel()
            }
        }
    }

    private func failStart() {
        starting?.resume(throwing: CompanionError.invalidResponse)
        starting = nil
    }

    deinit {
        let activeListener = listener
        let activePipes = Array(pipes.values)
        queue.async {
            activeListener?.cancel()
            activePipes.forEach { $0.close() }
        }
    }
}

private final class DSHLoopbackPipe: @unchecked Sendable {
    private let local: NWConnection
    private let upstream: NWConnection
    private let policy: DSHLoopbackPolicy
    private let queue: DispatchQueue
    private let completed: @Sendable () -> Void
    private let closed: @Sendable () -> Void
    private var requestHeader = Data()
    private var responseHeader = Data()
    private var callback = false
    private var isClosed = false
    private var interimResponses = 0
    private var responseStarted = false
    private var deadline: DispatchWorkItem?
    private var deadlineGeneration = 0
    private static let boundary = Data("\r\n\r\n".utf8)

    init(local: NWConnection, policy: DSHLoopbackPolicy, queue: DispatchQueue, upstream: NWConnection,
         completed: @escaping @Sendable () -> Void, closed: @escaping @Sendable () -> Void) {
        self.local = local; self.upstream = upstream; self.policy = policy; self.queue = queue
        self.completed = completed; self.closed = closed
    }

    func start() {
        local.stateUpdateHandler = { [weak self] state in
            switch state { case .failed, .cancelled: self?.close(); default: break }
        }
        upstream.stateUpdateHandler = { [weak self] state in
            switch state { case .failed: self?.reject(502); default: break }
        }
        local.start(queue: queue)
        expire(after: 10, status: 408)
        receiveRequestHeader()
    }

    func close() {
        guard !isClosed else { return }
        isClosed = true
        cancelDeadline()
        local.cancel(); upstream.cancel(); closed()
    }

    private func receiveRequestHeader() {
        local.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, done, error in
            guard let self, !self.isClosed else { return }
            if let data { self.requestHeader.append(data) }
            guard self.requestHeader.count <= 64 * 1024 else { self.reject(431); return }
            if let boundary = self.requestHeader.range(of: Self.boundary) {
                do {
                    let request = try self.policy.request(self.requestHeader[..<boundary.lowerBound])
                    self.callback = request.isCallback
                    self.expire(after: 120, status: 504)
                    var initial = request.header
                    initial.append(self.requestHeader[boundary.upperBound...])
                    self.requestHeader.removeAll()
                    self.upstream.start(queue: self.queue)
                    self.upstream.send(content: initial, completion: .contentProcessed { [weak self] error in
                        guard let self else { return }
                        if error != nil { self.reject(502); return }
                        self.copyRequestBody()
                    })
                    self.receiveResponseHeader()
                } catch DSHLoopbackPolicy.Rejection.forbidden { self.reject(403) }
                catch { self.reject(400) }
            } else if done || error != nil { self.close() }
            else { self.receiveRequestHeader() }
        }
    }

    private func copyRequestBody() {
        local.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, done, error in
            guard let self, !self.isClosed else { return }
            guard error == nil, !done else { self.close(); return }
            self.upstream.send(content: data, completion: .contentProcessed { [weak self] error in
                guard let self else { return }
                if error != nil { self.close() } else { self.copyRequestBody() }
            })
        }
    }

    private func receiveResponseHeader() {
        upstream.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, done, error in
            guard let self, !self.isClosed else { return }
            guard error == nil else { self.reject(502); return }
            if let data { self.responseHeader.append(data) }
            guard self.responseHeader.count <= 64 * 1024 else { self.reject(502); return }
            self.processBufferedResponse(done: done)
        }
    }

    private func processBufferedResponse(done: Bool) {
        guard let boundary = responseHeader.range(of: Self.boundary) else {
            if done { reject(502) } else { receiveResponseHeader() }
            return
        }
        do {
            let response = try policy.response(responseHeader[..<boundary.lowerBound], callback: callback)
            if response.interim {
                interimResponses += 1
                guard interimResponses <= 8 else { reject(502); return }
                responseHeader = responseHeader[boundary.upperBound...]
                if responseHeader.range(of: Self.boundary) != nil { processBufferedResponse(done: done) }
                else if done { reject(502) }
                else { receiveResponseHeader() }
                return
            }
            var initial = response.header
            if !callback { initial.append(responseHeader[boundary.upperBound...]) }
            responseHeader.removeAll()
            responseStarted = true
            cancelDeadline()
            local.send(content: initial, completion: .contentProcessed { [weak self] error in
                guard let self else { return }
                if error != nil { self.close(); return }
                if self.callback && response.completedAuthorization { self.completed(); self.close(); return }
                if done { self.close() } else { self.copyResponseBody() }
            })
        } catch { reject(callback ? 400 : 502) }
    }

    private func copyResponseBody() {
        upstream.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, done, error in
            guard let self, !self.isClosed else { return }
            guard error == nil else { self.close(); return }
            self.local.send(content: data, completion: .contentProcessed { [weak self] error in
                guard let self else { return }
                if error != nil || done { self.close() } else { self.copyResponseBody() }
            })
        }
    }

    private func reject(_ code: Int) {
        guard !isClosed else { return }
        guard !responseStarted else { close(); return }
        let response = Data("HTTP/1.1 \(code) Rejected\r\nContent-Length: 0\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n".utf8)
        local.send(content: response, completion: .contentProcessed { [weak self] _ in self?.close() })
    }

    private func cancelDeadline() {
        deadlineGeneration += 1
        deadline?.cancel()
        deadline = nil
    }

    private func expire(after seconds: Double, status: Int) {
        cancelDeadline()
        let current = deadlineGeneration
        let timer = DispatchWorkItem { [weak self] in
            guard let self, self.deadlineGeneration == current else { return }
            self.reject(status)
        }
        deadline = timer
        queue.asyncAfter(deadline: .now() + seconds, execute: timer)
    }
}
