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
    public private(set) var sessionOperation: SessionOperation?
    public private(set) var sessionErrorKey: String?
    public private(set) var sessionListRevision = 0
    public var server = UserDefaults.standard.string(forKey: "yun.chat.server") ?? "https://bot.yunle.fun"
    @ObservationIgnored public private(set) var client: MobileAPI?
    @ObservationIgnored private let vault = KeychainVault()
    @ObservationIgnored private let outbox: PendingMessages
    @ObservationIgnored private var didRestore = false
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var creationId: String?
    @ObservationIgnored private var draftSessionId: String?
    @ObservationIgnored private var sessionReadVersion = 0

    public init(client: MobileAPI? = nil, outbox: PendingMessages = PendingMessages()) {
        self.client = client
        self.outbox = outbox
    }

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
            creationId = nil
            draftSessionId = nil
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
        creationId = nil
        draftSessionId = nil
        client = MobileAPI(endpoint: endpoint, token: result.token)
        device = result.device
        await refresh()
    }

    public func refresh() async {
        guard let client, sessionOperation == nil else { return }
        let generation = self.generation
        let sessionReadVersion = self.sessionReadVersion
        do {
            async let list = client.sessions()
            async let current = client.botStatus()
            let result = try await (list, current)
            guard generation == self.generation, sessionReadVersion == self.sessionReadVersion,
                  sessionOperation == nil, !Task.isCancelled else { return }
            if sessions != result.0 { sessions = result.0 }
            status = result.1
            online = true
            errorKey = nil
        } catch {
            if Task.isCancelled || generation != self.generation || sessionReadVersion != self.sessionReadVersion { return }
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

    public func restartCloud() async -> Bool {
        guard let client, !busy else { return false }
        busy = true
        errorKey = nil
        defer { busy = false }
        do {
            try await client.restart(force: true)
            return true
        }
        catch {
            handle(error)
            return false
        }
    }

    /// Creates a server-side session only when there is a first message to send.
    /// A failed send keeps the created ID so retrying does not allocate another empty session.
    public func createAndSend(_ value: String) async -> String? {
        guard let client, !busy else { return nil }
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.utf16.count <= 4000 else { return nil }
        busy = true
        errorKey = nil
        defer { busy = false }
        do {
            let id: String
            if let draftSessionId {
                id = draftSessionId
            } else {
                if creationId == nil { creationId = UUID().uuidString }
                id = try await client.create(requestId: creationId!)
                creationId = nil
                draftSessionId = id
            }
            let pending = PendingMessage(sessionId: id, text: text)
            try await outbox.save(pending, origin: client.endpoint.absoluteString)
            do {
                try await client.send(text, to: id, requestId: pending.requestId)
            } catch {
                errorKey = (error as? CompanionError)?.localizationKey ?? "chat.delivery_unknown"
                return nil
            }
            try? await outbox.remove(origin: client.endpoint.absoluteString, sessionId: id)
            draftSessionId = nil
            await refresh()
            return id
        } catch {
            handle(error)
            return nil
        }
    }

    public func archive(_ session: SessionSummary) async {
        guard let client, !busy else { return }
        busy = true
        sessionReadVersion += 1
        sessionErrorKey = nil
        let archived = session.archived != true
        sessionOperation = SessionOperation(sessionId: session.id, kind: archived ? .archiving : .restoring)
        defer { busy = false; sessionOperation = nil }
        let generation = self.generation
        do {
            try await client.archive(session.id, archived: archived)
            guard generation == self.generation else { return }
            if let index = sessions.firstIndex(where: { $0.id == session.id }) {
                sessions[index] = sessions[index].settingArchived(archived)
                sessionListRevision += 1
            }
            sessionOperation = nil
            await refresh()
        } catch { if generation == self.generation { handleSessionError(error) } }
    }

    public func prepareDeletion(_ id: String) async -> DeletionConfirmation? {
        guard let client, !busy else { return nil }
        busy = true
        sessionErrorKey = nil
        sessionOperation = SessionOperation(sessionId: id, kind: .preparingDeletion)
        defer { busy = false; sessionOperation = nil }
        let generation = self.generation
        do {
            let confirmation = try await client.prepareDeletion(id)
            guard generation == self.generation else { return nil }
            return confirmation
        } catch { if generation == self.generation { handleSessionError(error) }; return nil }
    }

    public func delete(_ id: String, confirmation: String) async {
        guard let client, !busy else { return }
        busy = true
        sessionReadVersion += 1
        sessionErrorKey = nil
        sessionOperation = SessionOperation(sessionId: id, kind: .deleting)
        defer { busy = false; sessionOperation = nil }
        let generation = self.generation
        do {
            try await client.delete(id, confirmation: confirmation)
            try await PendingMessages().remove(origin: client.endpoint.absoluteString, sessionId: id)
            try await PendingMessages().remove(origin: client.endpoint.absoluteString, sessionId: "qq-manual-" + id)
            guard generation == self.generation else { return }
            sessions.removeAll { $0.id == id }
            sessionListRevision += 1
            sessionOperation = nil
            await refresh()
        } catch { if generation == self.generation { handleSessionError(error) } }
    }

    public func openGroup(_ id: String) async -> String? {
        guard let client, !busy else { return nil }
        busy = true
        defer { busy = false }
        let generation = self.generation
        do {
            let sessionId = try await client.openGroup(id)
            guard generation == self.generation else { return nil }
            await refresh()
            return sessionId
        } catch { if generation == self.generation { handle(error) }; return nil }
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
        sessionErrorKey = nil
    }

    private func handleSessionError(_ error: Error) {
        handle(error)
        sessionErrorKey = ["error.unavailable", "error.response", "error.rejected"].contains(errorKey ?? "")
            ? "sessions.error.operation" : errorKey
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
