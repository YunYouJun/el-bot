import Foundation
import Observation
import YunCore

@MainActor
@Observable
public final class AccountSyncStore {
    public private(set) var state = AccountSyncState(enabled: false, linked: false, profile: nil, preferences: nil)
    public private(set) var busy = false
    public private(set) var errorKey: String?
    public private(set) var instances: [AccountInstance] = []
    public private(set) var discoveryErrorKey: String?
    public private(set) var connectingInstanceId: String?
    public var canLink: Bool { proofAdopter.configured }
    public var canDiscover: Bool { state.discovery?.enabled == true && proofAdopter.configured }
    public var onPreferences: ((AccountPreferences) -> Void)?
    public var onConnected: ((PairingResult, String) async throws -> Void)?

    private let configuration: AccountSSOConfigurationProvider
    private let authorizer: AccountSSOAuthorizing
    private let proofAdopter: AccountProofAdopting
    private let client: () -> MobileAPI?

    public init(
        configuration: AccountSSOConfigurationProvider = AccountSSOConfigurationProvider(),
        authorizer: AccountSSOAuthorizing? = nil,
        proofAdopter: AccountProofAdopting = UnconfiguredAccountProofAdopter(),
        client: @escaping () -> MobileAPI? = { nil }
    ) {
        self.configuration = configuration
        self.authorizer = authorizer ?? WebAuthenticationSession()
        self.proofAdopter = proofAdopter
        self.client = client
    }

    public func restore() async {
        guard let client = client() else {
            state = AccountSyncState(enabled: false, linked: false, profile: nil, preferences: nil)
            instances = []
            return
        }
        do {
            let value = try await client.accountSyncState()
            state = value
            if let preferences = value.preferences { onPreferences?(AccountPreferences.sanitize(preferences)) }
            errorKey = nil
        }
        catch {
            let key = Self.key(for: error)
            state = AccountSyncState(enabled: false, linked: false, profile: nil, preferences: nil)
            instances = []
            errorKey = key == "error.account_not_configured" ? nil : key
        }
    }

    public func signInAndDiscover(language: String, deviceName: String) async {
        guard !busy, canDiscover, let client = client() else { return }
        busy = true
        discoveryErrorKey = nil
        defer { busy = false }
        do {
            let settings = try configuration.configuration()
            let callback: URL
            let request: AccountSSORequest
            if let session = authorizer as? WebAuthenticationSession {
                callback = try await session.begin(settings)
                guard let pending = session.pending else { throw AccountSSOError.invalidResponse }
                request = pending
            }
            else {
                callback = try await authorizer.authorize(settings)
                request = try Self.request(for: callback, authorizer: authorizer)
            }
            let proof = try await proofAdopter.proof(for: callback, request: request, configuration: settings)
            instances = try await client.accountInstances(proof: proof, deviceName: deviceName)
            discoveryErrorKey = instances.isEmpty ? "account.instances_empty" : nil
            let preferences = AccountPreferences(language: language, updatedAt: Date())
            let result = try await client.linkAccount(proof: proof, preferences: preferences)
            state = AccountSyncState(enabled: true, linked: true, profile: result.profile, preferences: result.preferences, discovery: state.discovery)
            onPreferences?(AccountPreferences.sanitize(result.preferences))
        }
        catch {
            discoveryErrorKey = Self.key(for: error)
        }
    }

    public func connect(instance: AccountInstance, language: String, deviceName: String) async {
        guard !busy, canDiscover, connectingInstanceId == nil,
              let client = client(), let onConnected else { return }
        connectingInstanceId = instance.id
        discoveryErrorKey = nil
        defer { connectingInstanceId = nil }
        do {
            let settings = try configuration.configuration()
            let callback: URL
            let request: AccountSSORequest
            if let session = authorizer as? WebAuthenticationSession {
                callback = try await session.begin(settings)
                guard let pending = session.pending else { throw AccountSSOError.invalidResponse }
                request = pending
            }
            else {
                callback = try await authorizer.authorize(settings)
                request = try Self.request(for: callback, authorizer: authorizer)
            }
            let proof = try await proofAdopter.proof(for: callback, request: request, configuration: settings)
            let result = try await client.enroll(proof: proof, instance: instance, deviceName: deviceName)
            try await onConnected(result, instance.publicOrigin)
            instances = []
            if !state.linked {
                let preferences = AccountPreferences(language: language, updatedAt: Date())
                let linked = try await client.linkAccount(proof: proof, preferences: preferences)
                state = AccountSyncState(enabled: true, linked: true, profile: linked.profile, preferences: linked.preferences, discovery: state.discovery)
                onPreferences?(AccountPreferences.sanitize(linked.preferences))
            }
        }
        catch {
            discoveryErrorKey = Self.key(for: error)
        }
    }

    public func link(language: String) async {
        guard !busy, state.enabled, let client = client() else { return }
        guard proofAdopter.configured else {
            errorKey = AccountSSOError.notConfigured.localizationKey
            return
        }
        busy = true
        errorKey = nil
        defer { busy = false }
        do {
            let settings = try configuration.configuration()
            let callback: URL
            let request: AccountSSORequest
            if let session = authorizer as? WebAuthenticationSession {
                callback = try await session.begin(settings)
                guard let pending = session.pending else { throw AccountSSOError.invalidResponse }
                request = pending
            }
            else {
                callback = try await authorizer.authorize(settings)
                request = try Self.request(for: callback, authorizer: authorizer)
            }
            let proof = try await proofAdopter.proof(for: callback, request: request, configuration: settings)
            let preferences = AccountPreferences(language: language, updatedAt: Date())
            let result = try await client.linkAccount(proof: proof, preferences: preferences)
            state = AccountSyncState(enabled: true, linked: true, profile: result.profile, preferences: result.preferences, discovery: state.discovery)
            onPreferences?(AccountPreferences.sanitize(result.preferences))
        }
        catch {
            errorKey = Self.key(for: error)
        }
    }

    public func savePreferences(language: String) async {
        guard !busy, state.linked, let client = client() else { return }
        busy = true
        errorKey = nil
        defer { busy = false }
        do {
            let result = try await client.saveAccountPreferences(AccountPreferences(language: language, updatedAt: Date()))
            state = AccountSyncState(enabled: state.enabled, linked: state.linked, profile: state.profile, preferences: result, discovery: state.discovery)
            onPreferences?(AccountPreferences.sanitize(result))
        }
        catch { errorKey = Self.key(for: error) }
    }

    public func unlink() async {
        guard !busy, state.linked, let client = client() else { return }
        busy = true
        errorKey = nil
        defer { busy = false }
        do {
            try await client.unlinkAccount()
            state = AccountSyncState(enabled: state.enabled, linked: false, profile: nil, preferences: nil, discovery: state.discovery)
        }
        catch { errorKey = Self.key(for: error) }
    }

    private static func request(for callback: URL, authorizer: AccountSSOAuthorizing) throws -> AccountSSORequest {
        if let session = authorizer as? WebAuthenticationSession, let request = session.pending {
            return request
        }
        throw AccountSSOError.invalidResponse
    }

    private static func key(for error: Error) -> String {
        if let account = error as? AccountSSOError { return account.localizationKey }
        return (error as? CompanionError)?.localizationKey ?? "error.unavailable"
    }

}
