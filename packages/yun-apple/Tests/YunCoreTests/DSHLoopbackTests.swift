import Foundation
import Network
import Testing
@testable import YunCore

struct DSHLoopbackTests {
    let policy = DSHLoopbackPolicy(localOrigin: URL(string: "http://127.0.0.1:49152")!, upstreamOrigin: URL(string: "https://bot.example.test")!, localCookieName: "local", localCookieValue: "native-only", upstreamCookie: "cloud=cloud-only")
    func request(_ path: String = "/", method: String = "GET", headers: String = "Cookie: local=native-only\r\n") -> Data {
        Data("\(method) \(path) HTTP/1.1\r\nHost: 127.0.0.1:49152\r\n\(headers)".utf8)
    }

    @Test func forwardsOnlyAuthorizedSameOriginTraffic() throws {
        let value = try policy.request(request("/api/remote.mux", method: "POST", headers: "Cookie: local=native-only\r\nOrigin: http://127.0.0.1:49152\r\nAuthorization: must-not-forward\r\nContent-Length: 0\r\n"))
        let header = String(decoding: value.header, as: UTF8.self)
        #expect(header.contains("Host: bot.example.test\r\n"))
        #expect(header.contains("Cookie: cloud=cloud-only\r\n"))
        #expect(header.contains("Origin: https://bot.example.test\r\n"))
        #expect(!header.contains("native-only"))
        #expect(!header.contains("must-not-forward"))
        #expect(throws: (any Error).self) { try policy.request(request(headers: "")) }
        #expect(throws: (any Error).self) { try policy.request(request(headers: "Cookie: local=native-only\r\nOrigin: http://127.0.0.1:1111\r\n")) }
        #expect(throws: (any Error).self) { try policy.request(request(headers: "Cookie: local=native-only\r\nSec-Fetch-Site: cross-site\r\n")) }
        #expect(throws: (any Error).self) { try policy.request(Data("GET / HTTP/1.1\r\nHost: attacker.example\r\nCookie: local=native-only\r\n".utf8)) }
    }

    @Test func callbackHasNoGeneralOwnerAccess() throws {
        #expect(try policy.request(request("/oauth/callback?code=opaque-code&state=opaque-state", headers: "")).isCallback)
        #expect(throws: (any Error).self) { try policy.request(request("/oauth/callback?code=x&state=y&state=z", headers: "")) }
        #expect(throws: (any Error).self) { try policy.request(request("/oauth/callback?code=x", headers: "")) }
        #expect(throws: (any Error).self) { try policy.request(request("/api/remote.mux?code=x&state=y", headers: "")) }
        #expect(throws: (any Error).self) { try policy.request(request("/oauth/callback?code=x&state=y", method: "POST", headers: "")) }
    }

    @Test func rejectsAmbiguousFramingAndForeignTargets() throws {
        #expect(throws: (any Error).self) { try policy.request(request("//attacker.example/")) }
        #expect(throws: (any Error).self) { try policy.request(request("https://attacker.example/")) }
        #expect(throws: (any Error).self) { try policy.request(request(headers: "Cookie: local=native-only\r\nContent-Length: 1\r\nContent-Length: 1\r\n")) }
        #expect(throws: (any Error).self) { try policy.request(request(headers: "Cookie: local=native-only\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n")) }
    }

    @Test func keepsWebSocketTransportAndFiltersCloudCookies() throws {
        #expect(try policy.request(request("/api/remote.mux", headers: "Cookie: local=native-only\r\nUpgrade: websocket\r\nConnection: upgrade\r\n")).isWebSocket)
        #expect(throws: (any Error).self) { try policy.request(request("/other", headers: "Cookie: local=native-only\r\nUpgrade: websocket\r\n")) }
        let result = try policy.response(Data("HTTP/1.1 302 Found\r\nLocation: https://bot.example.test/page?q=1\r\nSet-Cookie: cloud=never-expose\r\n".utf8))
        let header = String(decoding: result.header, as: UTF8.self)
        #expect(header.contains("Location: http://127.0.0.1:49152/page?q=1"))
        #expect(!header.contains("never-expose"))
        #expect(!result.completedAuthorization)
        #expect(try policy.response(Data("HTTP/1.1 302 Found\r\nLocation: https://platform.deepseek.com/dsh/authorized\r\n".utf8)).completedAuthorization)
    }

    @Test func localListenerRequiresItsPrivateCookieAndStops() async throws {
        let proxy = DSHLoopbackProxy(origin: URL(string: "https://bot.example.test")!, upstreamCookie: "cloud=private", connectionFactory: { NWConnection(host: "127.0.0.1", port: 1, using: .tcp) })
        let session = try await proxy.start()
        #expect(session.origin.host == "127.0.0.1")
        let browserCookie = try session.browserCookie()
        #expect(browserCookie.isHTTPOnly)
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        let client = URLSession(configuration: config)
        let (_, response) = try await client.data(from: session.origin)
        #expect((response as? HTTPURLResponse)?.statusCode == 403)
        await proxy.stop()
        var request = URLRequest(url: session.origin)
        request.timeoutInterval = 1
        await #expect(throws: (any Error).self) { try await client.data(for: request) }
        client.invalidateAndCancel()
    }
}

private final class DSHLoopbackFixture: @unchecked Sendable {
    let queue = DispatchQueue(label: "DSHLoopbackFixture")
    let listener: NWListener
    let response: Data?
    init(response: Data? = nil) throws {
        self.response = response
        let options = NWParameters.tcp
        options.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: options)
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { connection.cancel(); return }
            connection.start(queue: self.queue)
            self.read(connection, bytes: Data())
        }
    }
    func start() async throws -> NWEndpoint.Port {
        try await withCheckedThrowingContinuation { continuation in
            listener.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready: continuation.resume(returning: self.listener.port!)
                case .failed(let error): continuation.resume(throwing: error)
                default: break
                }
            }
            listener.start(queue: queue)
        }
    }
    private func read(_ connection: NWConnection, bytes: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, done, error in
            guard let self else { return }
            var bytes = bytes
            if let data { bytes.append(data) }
            guard bytes.range(of: Data("\r\n\r\n".utf8)) != nil else {
                if done || error != nil { connection.cancel() } else { self.read(connection, bytes: bytes) }
                return
            }
            if let response = self.response {
                connection.send(content: response, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { _ in })
                return
            }
            let body = bytes
            let first = Data("HTTP/1.1 103 Early Hints\r\nSet-Cookie: interim=private\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: \(body.count)\r\nSet-Cookie: cloud=private\r\nConnection: close\r\n\r\n".utf8)
            connection.send(content: first, completion: .contentProcessed { _ in
                self.queue.asyncAfter(deadline: .now() + 0.02) {
                    connection.send(content: body, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { _ in })
                }
            })
        }
    }
}

extension DSHLoopbackTests {
    @Test func streamsARealHTTPExchangeWithoutExposingCookieHeaders() async throws {
        let fixture = try DSHLoopbackFixture()
        let port = try await fixture.start()
        defer { fixture.listener.cancel() }
        let proxy = DSHLoopbackProxy(origin: URL(string: "https://bot.example.test")!, upstreamCookie: "cloud=host-only", connectionFactory: {
            NWConnection(host: "127.0.0.1", port: port, using: .tcp)
        })
        let session = try await proxy.start()
        let cookie = try session.browserCookie()
        var request = URLRequest(url: session.origin.appendingPathComponent("api/remote.mux"))
        request.setValue(cookie.name + "=" + cookie.value, forHTTPHeaderField: "Cookie")
        request.setValue(session.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.timeoutInterval = 5
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        let client = URLSession(configuration: configuration)
        let (body, response) = try await client.data(for: request)
        let headers = String(decoding: body, as: UTF8.self)
        #expect((response as? HTTPURLResponse)?.statusCode == 200)
        #expect((response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Set-Cookie") == nil)
        #expect(headers.contains("Cookie: cloud=host-only"))
        #expect(headers.contains("Origin: https://bot.example.test"))
        #expect(!headers.contains(cookie.value))
        await proxy.stop()
        client.invalidateAndCancel()
    }
}

extension DSHLoopbackTests {
    @Test func unauthenticatedCallbackCannotReadTheUpstreamFallbackPage() async throws {
        let fixture = try DSHLoopbackFixture()
        let port = try await fixture.start()
        defer { fixture.listener.cancel() }
        let proxy = DSHLoopbackProxy(origin: URL(string: "https://bot.example.test")!, upstreamCookie: "cloud=host-only", connectionFactory: {
            NWConnection(host: "127.0.0.1", port: port, using: .tcp)
        })
        let session = try await proxy.start()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        let client = URLSession(configuration: configuration)
        let url = session.origin.appendingPathComponent("oauth/callback").appending(queryItems: [.init(name: "code", value: "invalid"), .init(name: "state", value: "invalid")])
        let (body, response) = try await client.data(from: url)
        #expect((response as? HTTPURLResponse)?.statusCode == 400)
        #expect(body.isEmpty)
        await proxy.stop()
        client.invalidateAndCancel()
    }
}


private final class DSHNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

extension DSHLoopbackTests {
    @Test func callbackCompletesOnlyWithTheOfficialRedirectAndNeverReturnsUpstreamContent() async throws {
        let reply = Data("HTTP/1.1 302 Found\r\nLocation: https://platform.deepseek.com/dsh/authorized?result=ok\r\nSet-Cookie: cloud=private\r\nContent-Length: 7\r\nConnection: close\r\n\r\nprivate".utf8)
        let fixture = try DSHLoopbackFixture(response: reply)
        let port = try await fixture.start()
        defer { fixture.listener.cancel() }
        try await confirmation { completed in
            let proxy = DSHLoopbackProxy(origin: URL(string: "https://bot.example.test")!, upstreamCookie: "cloud=host-only", connectionFactory: {
                NWConnection(host: "127.0.0.1", port: port, using: .tcp)
            }, authorizationCompleted: { completed() })
            let session = try await proxy.start()
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = nil
            let client = URLSession(configuration: configuration, delegate: DSHNoRedirect(), delegateQueue: nil)
            let url = session.origin.appendingPathComponent("oauth/callback").appending(queryItems: [.init(name: "code", value: "opaque"), .init(name: "state", value: "opaque")])
            let (body, response) = try await client.data(from: url)
            #expect((response as? HTTPURLResponse)?.statusCode == 302)
            #expect((response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Location") == "https://platform.deepseek.com/dsh/authorized?result=ok")
            #expect((response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Set-Cookie") == nil)
            #expect(body.isEmpty)
            await proxy.stop()
            client.invalidateAndCancel()
        }
        for location in ["https://attacker.example/dsh/authorized", "https://platform.deepseek.com/other", "https://user@platform.deepseek.com/dsh/authorized"] {
            #expect(throws: (any Error).self) {
                try policy.response(Data("HTTP/1.1 302 Found\r\nLocation: \(location)\r\n".utf8), callback: true)
            }
        }
        #expect(throws: (any Error).self) {
            try policy.response(Data("HTTP/1.1 302 Found\r\nLocation: https://platform.deepseek.com/dsh/authorized\r\nLocation: https://platform.deepseek.com/dsh/authorized\r\n".utf8), callback: true)
        }
    }
}
