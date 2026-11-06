import Foundation
import Observation
import YunBotCore

@MainActor
@Observable
final class AppStore {
    var device: Device?
    var sessions: [SessionSummary] = []
    var status: BotStatus?
    var busy = false
    var errorKey: String?
    var online = false
    var server = UserDefaults.standard.string(forKey: "server") ?? "https://bot.yunle.fun"
    @ObservationIgnored private(set) var client: MobileAPI?
    @ObservationIgnored private let vault = KeychainVault()
    @ObservationIgnored private var didRestore = false

    func restore() async {
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
            client = MobileAPI(endpoint: endpoint, token: saved.token)
            device = saved.device
            await refresh()
        } catch { errorKey = "error.restore" }
    }

    func pair(server: String, code: String, name: String) async {
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
            UserDefaults.standard.set(self.server, forKey: "server")
            client = api
            device = paired.device
            await refresh()
        } catch { handle(error) }
    }

    func refresh() async {
        guard let client else { return }
        do {
            async let list = client.sessions()
            async let current = client.botStatus()
            let result = try await (list, current)
            if sessions != result.0 { sessions = result.0 }
            status = result.1
            online = true
            errorKey = nil
        } catch {
            if Task.isCancelled { return }
            online = false
            handle(error)
        }
    }

    func create() async -> String? {
        guard let client, !busy else { return nil }
        busy = true
        defer { busy = false }
        do {
            let id = try await client.create(requestId: UUID().uuidString)
            await refresh()
            return id
        } catch { handle(error); return nil }
    }

    func disconnect() async {
        if let client { try? await client.revoke() }
        if let endpoint = try? Endpoint(server) { vault.remove(origin: endpoint.absoluteString) }
        client = nil
        device = nil
        sessions = []
        status = nil
        online = false
        errorKey = nil
    }

    func handle(_ error: Error) {
        guard !Task.isCancelled else { return }
        if error is KeychainVault.Failure {
            errorKey = "error.storage"
            return
        }
        if error as? CompanionError == .unauthorized {
            if let endpoint = try? Endpoint(server) { vault.remove(origin: endpoint.absoluteString) }
            client = nil
            device = nil
            sessions = []
            status = nil
        }
        errorKey = (error as? CompanionError)?.localizationKey ?? "error.unavailable"
    }
}
