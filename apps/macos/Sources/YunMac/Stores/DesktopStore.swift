import Foundation
import Observation
import SwiftUI
import YunCore

@MainActor @Observable final class DesktopStore {
    var state = ClientSnapshot()
    var ready = false
    var transportFailed = false
    var draftValues: [String: String] = [:]
    var phonePairing: (code: String, expiresAt: Date)?
    var webNavigationRequest = 0
    @ObservationIgnored private var transport: ControllerTransport?
    @ObservationIgnored var onPairing: ((String, String) -> Void)?

    init() {
        let fallback = YunStrings()
        state.locale = fallback.locale
    }

    func startController() {
        guard transport == nil, !transportFailed else { return }
        do {
            transport = try ControllerTransport(settingsPath: Self.settingsArgument) { [weak self] update in
                guard let self else { return }
                switch update {
                case .snapshot(let snapshot):
                    if !self.ready { self.draftValues = snapshot.draft }
                    self.state = snapshot
                    self.ready = true
                case .failed: self.transportFailed = true; self.ready = false
                case .pairing(let server, let code, let purpose, let expiresAt):
                    if purpose == "phone" { self.phonePairing = (code, expiresAt) }
                    else { self.onPairing?(server, code) }
                }
            }
        } catch { transportFailed = true }
    }

    var disabled: Bool { !ready || state.pending }
    var error: String { transportFailed ? text("errorRuntime") : state.error }
    func text(_ key: String) -> String {
        state.strings[key] ?? YunStrings(preference: state.locale)[key]
    }
    func send(_ action: String, _ value: String = "", field: String = "") {
        guard ready else { return }
        do { try transport?.send(ClientEvent(action, value, field: field)) }
        catch { transportFailed = true; ready = false }
    }
    func draft(_ field: String) -> Binding<String> {
        Binding(get: { self.draftValues[field] ?? "" }, set: { self.edit(field, value: $0) })
    }
    func edit(_ field: String, value: String) {
        draftValues[field] = value
        send("edit", value, field: field)
    }
    func preference(_ field: String) -> Binding<String> {
        Binding(get: {
            field == "messageFormat" ? self.state.preferences.messageFormat : self.state.preferences.imageTheme
        }, set: { self.send("editPreference", $0, field: field) })
    }
    func stopController() { transport?.stop() }
    func openDSHWeb() { webNavigationRequest += 1 }
    static var settingsArgument: String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--settings"), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }
}
