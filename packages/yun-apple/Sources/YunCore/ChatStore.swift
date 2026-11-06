import Foundation
import Observation

@MainActor
@Observable
public final class ChatStore {
    public private(set) var device: Device?
    public private(set) var sessions: [SessionSummary] = []
    public private(set) var status: BotStatus?
    public private(set) var busy = false
    public private(set) var errorKey: String?
    public private(set) var online = false
    public var server = UserDefaults.standard.string(forKey: "yun.chat.server") ?? "https://bot.yunle.fun"
    @ObservationIgnored public private(set) var client: MobileAPI?
    @ObservationIgnored private let vault = KeychainVault()
    @ObservationIgnored private var didRestore = false
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var creationId: String?

    public init() {}

    public func restore() async {
        guard !didRestore else { return }
        didRestore = true
        guard !server.isEmpty else { return }
        do {
            let endpoint = try Endpoint(server)
            guard let bytes = try vault.load(origin: endpoint.absoluteString) else { return }
            let saved = try MobileJSON.decoder().decode(PairingResult.self, from: bytes)
            guard saved.device.expiresAt > Date() else {
                vault.remove(origin: endpoint.absoluteString)
                return
            }
            generation += 1
            client = MobileAPI(endpoint: endpoint, token: saved.token)
            device = saved.device
            await refresh()
        } catch { errorKey = "error.restore" }
    }

    public func pair(server: String, code: String, name: String) async {
        guard !busy else { return }
        busy = true
        errorKey = nil
        defer { busy = false }
        do {
            let endpoint = try Endpoint(server)
            let api = MobileAPI(endpoint: endpoint)
            let paired = try await api.pair(code: code, deviceName: name)
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            do { try vault.save(encoder.encode(paired), origin: endpoint.absoluteString) }
            catch {
                try? await api.revoke()
                throw error
            }
            self.server = endpoint.absoluteString
            UserDefaults.standard.set(self.server, forKey: "yun.chat.server")
            generation += 1
            client = api
            device = paired.device
            await refresh()
        } catch { handle(error) }
    }

    public func acceptEnrollment(_ result: PairingResult, origin: String) async throws {
        let endpoint = try Endpoint(origin)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try vault.save(encoder.encode(result), origin: endpoint.absoluteString)
        server = endpoint.absoluteString
        UserDefaults.standard.set(server, forKey: "yun.chat.server")
        generation += 1
        client = MobileAPI(endpoint: endpoint, token: result.token)
        device = result.device
        await refresh()
    }

    public func refresh() async {
        guard let client else { return }
        let generation = self.generation
        do {
            async let list = client.sessions()
            async let current = client.botStatus()
            let result = try await (list, current)
            guard generation == self.generation, !Task.isCancelled else { return }
            if sessions != result.0 { sessions = result.0 }
            status = result.1
            online = true
            errorKey = nil
        } catch {
            if Task.isCancelled || generation != self.generation { return }
            online = false
            handle(error)
        }
    }

    public func create() async -> String? {
        guard let client, !busy else { return nil }
        busy = true
        defer { busy = false }
        do {
            if creationId == nil { creationId = UUID().uuidString }
            let id = try await client.create(requestId: creationId!)
            creationId = nil
            await refresh()
            return id
        } catch { handle(error); return nil }
    }

    public func disconnect() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { if let client { try await client.revoke() } }
        catch {
            if error as? CompanionError != .unauthorized {
                errorKey = "connect.disconnect_failed"
                return
            }
        }
        if let endpoint = try? Endpoint(server) { vault.remove(origin: endpoint.absoluteString) }
        generation += 1
        client = nil
        device = nil
        sessions = []
        status = nil
        online = false
        errorKey = nil
    }

    public func handle(_ error: Error) {
        guard !Task.isCancelled else { return }
        if error is KeychainVault.Failure {
            errorKey = "error.storage"
            return
        }
        if error as? CompanionError == .unauthorized {
            generation += 1
            if let endpoint = try? Endpoint(server) { vault.remove(origin: endpoint.absoluteString) }
            client = nil
            device = nil
            sessions = []
            status = nil
        }
        errorKey = (error as? CompanionError)?.localizationKey ?? "error.unavailable"
    }
}
