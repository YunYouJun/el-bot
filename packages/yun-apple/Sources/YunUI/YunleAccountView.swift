#if os(iOS)
import AuthenticationServices
import Observation
import SwiftUI
import UIKit
import YunCore

@MainActor
private final class YunleLoginBrowser: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private var onCancel: (() -> Void)?
    func open(_ url: URL, onCancel: @escaping () -> Void) throws {
        self.onCancel = onCancel
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: nil) { [weak self] _, _ in
            Task { @MainActor in self?.onCancel?() }
        }
        session.presentationContextProvider = self
        self.session = session
        guard session.start() else { finish(); throw YunleAccountError.service("LOGIN_UNAVAILABLE") }
    }
    func finish() { onCancel = nil; session?.cancel(); session = nil }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}

@MainActor
@Observable
public final class YunleAccountStore {
    public private(set) var userID: String?
    public private(set) var overview: YunleAccountOverview?
    public private(set) var consumption: YunleConsumptionSummary?
    public private(set) var receipts: [YunleUsageReceipt] = []
    public private(set) var nextCursor: String?
    public private(set) var busy = false
    public private(set) var signingIn = false
    public private(set) var stale = false
    public private(set) var updatedAt: Date?
    public private(set) var errorKey: String?
    @ObservationIgnored private let client: any YunleAccountServing
    @ObservationIgnored private let browser = YunleLoginBrowser()
    @ObservationIgnored private var loginTask: Task<Void, Never>?
    @ObservationIgnored private var restored = false
    public init(client: any YunleAccountServing = YunleAccountClient()) { self.client = client }
    public func restore() async {
        guard !restored else { return }
        restored = true
        do { userID = try await client.restore(); if userID != nil { await refresh() } }
        catch { errorKey = Self.message(error) }
    }
    public func signIn() {
        guard !busy, !signingIn else { return }
        signingIn = true; errorKey = nil
        loginTask = Task {
            defer { browser.finish(); signingIn = false; loginTask = nil }
            do {
                let pending = try await client.beginLogin()
                try browser.open(pending.verificationURL) { [weak self] in self?.cancelSignIn() }
                var interval = pending.interval
                while pending.expiresAt > Date() {
                    try await Task.sleep(for: .seconds(interval))
                    do {
                        if let user = try await client.pollLogin() {
                            browser.finish()
                            userID = user
                            await refresh()
                            return
                        }
                    }
                    catch YunleAccountError.service("AUTH_SLOW_DOWN") { interval = min(interval + 5, 60) }
                }
                throw YunleAccountError.service("AUTH_EXPIRED")
            }
            catch is CancellationError { await client.cancelLogin() }
            catch let error as URLError where error.code == .cancelled { await client.cancelLogin() }
            catch { errorKey = Self.message(error); await client.cancelLogin() }
        }
    }
    public func cancelSignIn() { loginTask?.cancel(); browser.finish() }
    public func refresh() async {
        guard !busy, userID != nil else { return }
        busy = true; errorKey = nil
        defer { busy = false }
        do {
            let account = try await client.overview()
            let summary = try await client.consumptionSummary()
            let page = try await client.usage(cursor: nil)
            overview = account; consumption = summary; receipts = page.items; nextCursor = page.nextCursor
            updatedAt = Date(); stale = false
        }
        catch { stale = overview != nil; errorKey = Self.message(error) }
    }
    public func loadMore() async {
        guard !busy, let cursor = nextCursor else { return }
        busy = true; errorKey = nil
        defer { busy = false }
        do {
            let page = try await client.usage(cursor: cursor)
            guard page.nextCursor != cursor else { throw YunleAccountError.invalidResponse }
            let known = Set(receipts.map(\.id))
            receipts.append(contentsOf: page.items.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        }
        catch { errorKey = Self.message(error) }
    }
    public func signOut() async {
        guard !busy, !signingIn else { return }
        busy = true; errorKey = nil
        defer { busy = false }
        do {
            try await client.logout()
            userID = nil; overview = nil; consumption = nil; receipts = []; nextCursor = nil; updatedAt = nil; stale = false
        }
        catch { errorKey = Self.message(error) }
    }
    private static func message(_ error: any Error) -> String {
        switch error {
        case YunleAccountError.signInRequired: "yunle.error.signin"
        case YunleAccountError.refreshUncertain: "yunle.error.refresh"
        case YunleAccountError.storage: "yunle.error.storage"
        case YunleAccountError.service(let code) where ["client_unknown", "client_unavailable", "adapter_not_allowed"].contains(code): "yunle.error.unavailable"
        case YunleAccountError.service(let code) where ["DEVICE_AUTH_REQUIRED", "grant_revoked", "refresh_expired", "refresh_reused", "invalid_grant", "client_policy_changed"].contains(code): "yunle.error.signin"
        case YunleAccountError.service("AUTH_DENIED"): "yunle.error.denied"
        case YunleAccountError.service("AUTH_EXPIRED"): "yunle.error.expired"
        default: "yunle.error.network"
        }
    }
}

public struct YunleAccountSection: View {
    @Bindable var store: YunleAccountStore
    let strings: YunStrings
    public init(store: YunleAccountStore, strings: YunStrings) { self.store = store; self.strings = strings }
    public var body: some View {
        Section {
            if store.userID != nil {
                NavigationLink { YunleAccountView(store: store, strings: strings) } label: {
                    Label(strings["yunle.usage.title"], systemImage: "chart.bar.xaxis")
                }
                if let account = store.overview?.account {
                    LabeledContent(strings["yunle.available"], value: yunlePoints(account.availableMicroPoints))
                }
            }
            else {
                Button { store.signIn() } label: { Label(strings["yunle.signin"], systemImage: "person.crop.circle") }
                    .disabled(store.signingIn || store.busy)
                    .accessibilityIdentifier("yunleSignIn")
            }
            if store.signingIn {
                HStack { ProgressView(); Text(strings["yunle.waiting"]) }
                Button(strings["cancel"]) { store.cancelSignIn() }
            }
            if let error = store.errorKey { Text(strings[error]).font(.footnote).foregroundStyle(.red) }
        } header: { Text(strings["yunle.account"]) }
        footer: { Text(strings["yunle.readonly"]) }
    }
}

public struct YunleAccountView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var store: YunleAccountStore
    let strings: YunStrings
    public init(store: YunleAccountStore, strings: YunStrings) { self.store = store; self.strings = strings }
    public var body: some View {
        List {
            if let account = store.overview?.account {
                Section {
                    NavigationLink {
                        YunlePointAccountView(store: store, strings: strings)
                    } label: {
                        LabeledContent(strings["yunle.brand"]) {
                            Text("\(strings["yunle.balance.available"]) \(yunlePoints(account.availableMicroPoints)) \(strings["yunle.summary.unit"])")
                                .font(.subheadline.monospacedDigit())
                        }
                    }
                    .accessibilityIdentifier("yunlePointAccountDetails")
                    .accessibilityHint(strings["yunle.balance.details_hint"])
                }
            }
            if let summary = store.consumption {
                YunleConsumptionSections(
                    summary: summary,
                    stale: store.stale,
                    syncedAt: store.updatedAt,
                    busy: store.busy,
                    strings: strings,
                    reload: { Task { await store.refresh() } }
                )
            }
            if let error = store.errorKey {
                Section {
                    Label(strings[error], systemImage: "exclamationmark.circle").foregroundStyle(.red)
                    Button(strings["yunle.retry"]) { Task { await store.refresh() } }.disabled(store.busy)
                }
            }
            if !store.receipts.isEmpty || store.nextCursor != nil || (store.busy && store.updatedAt == nil) {
                Section {
                    if store.receipts.isEmpty && !store.busy && store.updatedAt != nil { Text(strings["yunle.empty"]).foregroundStyle(.secondary) }
                    ForEach(store.receipts) { receipt in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(receipt.model ?? strings["yunle.model_unknown"]).font(.subheadline.weight(.medium))
                                Spacer(minLength: 12)
                                Text((receipt.type == "refund" ? "+" : "−") + yunlePoints(abs(receipt.chargedMicroPoints)))
                                    .font(.subheadline.monospacedDigit()).fixedSize(horizontal: true, vertical: false)
                            }
                            HStack {
                                Text(receipt.type == "refund" ? strings["yunle.refund"] : strings["yunle.settled"])
                                Text(receipt.date, format: .dateTime.month().day().hour().minute())
                            }.font(.caption).foregroundStyle(.secondary)
                            if let input = receipt.inputTokens, let output = receipt.outputTokens {
                                Text("\(strings["yunle.input"]) \(input.formatted()) · \(strings["yunle.output"]) \(output.formatted()) tokens")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }.padding(.vertical, 4)
                    }
                    if store.nextCursor != nil {
                        Button(strings["yunle.more"]) { Task { await store.loadMore() } }.disabled(store.busy)
                    }
                    if store.busy { ProgressView() }
                } header: { Text(strings["yunle.history"]) }
                footer: { Text(strings["yunle.history_hint"]) }
            }
            // Snapshot status lives next to the summary. Keep a fallback here for
            // the rare case where no summary loaded but a previous refresh succeeded.
            if store.consumption == nil, let updated = store.updatedAt {
                Section {
                    LabeledContent(strings[store.stale ? "yunle.stale" : "yunle.updated"]) { Text(updated, style: .relative) }
                }
            }
            Section {
                Button(strings["yunle.signout"], role: .destructive) { Task { await store.signOut() } }.disabled(store.busy)
            } footer: { Text(strings["yunle.signout_hint"]) }
        }
        .navigationTitle(strings["yunle.usage.title"])
        .refreshable { await store.refresh() }
        .task { await store.refresh() }
        .onChange(of: store.userID) { _, value in if value == nil { dismiss() } }
    }
}
private struct YunlePointAccountView: View {
    @Bindable var store: YunleAccountStore
    let strings: YunStrings

    var body: some View {
        List {
            if let account = store.overview?.account {
                Section {
                    LabeledContent(strings["yunle.available"], value: yunlePoints(account.availableMicroPoints))
                    LabeledContent(strings["yunle.reserved"], value: yunlePoints(account.reservedMicroPoints))
                    LabeledContent(strings["yunle.charged"], value: yunlePoints(account.chargedMicroPoints))
                } header: { Text(strings["yunle.account_points"]) }
                footer: { Text(strings["yunle.account_total"]) }
            }
            if let error = store.errorKey {
                Section {
                    Label(strings[error], systemImage: "exclamationmark.circle").foregroundStyle(.red)
                    Button(strings["yunle.retry"]) { Task { await store.refresh() } }.disabled(store.busy)
                }
            }
        }
        .navigationTitle(strings["yunle.balance.details"])
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refresh() }
    }
}
func yunlePoints(_ amount: Int64) -> String {
    (Decimal(amount) / 1_000_000).formatted(.number.precision(.fractionLength(0...6)))
}
#endif
