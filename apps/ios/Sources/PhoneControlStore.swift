import Observation
import UIKit
import YunCore

@MainActor @Observable final class PhoneControlStore {
    private(set) var channel: PhoneChannel?
    private(set) var busy = false
    private(set) var errorKey: String?
    private(set) var lastReceipt: PhoneReceipt?
    private let client = ICtrlClient()
    private var generation = 0

    func enable(_ api: MobileAPI) async {
        guard !busy, channel == nil else { return }
        busy = true
        errorKey = nil
        generation += 1
        let current = generation
        defer { busy = false; writeDiagnostics("enable") }
        do {
            let status = try await client.probe()
            guard status.paired else { throw ICtrlError.notPaired }
            try Task.checkCancellation()
            let opened = try await api.openPhoneChannel(requestId: UUID().uuidString, apps: PhoneApp.allCases)
            guard current == generation, !Task.isCancelled else {
                try? await api.closePhoneChannel(opened)
                return
            }
            channel = opened
        } catch {
            if !Task.isCancelled { errorKey = (error as? ICtrlError)?.localizationKey ?? "phone.error.connection" }
        }
    }

    func disable(_ api: MobileAPI?) async {
        generation += 1
        let previous = channel
        channel = nil
        if let previous, let api { try? await api.closePhoneChannel(previous) }
        writeDiagnostics("disable")
    }

    func run(_ api: MobileAPI) async {
        guard let channel else { return }
        let current = generation
        var pending: PhoneReceipt?
        defer {
            if current == generation { self.channel = nil }
            Task { try? await api.closePhoneChannel(channel) }
            writeDiagnostics("closed")
        }
        do {
            while !Task.isCancelled, current == generation, channel.expiresAt > Date() {
                // Ordinary background time never creates an always-on control channel.
                guard UIApplication.shared.applicationState == .active else {
                    try await Task.sleep(for: .seconds(1))
                    continue
                }
                do {
                    if let receipt = pending {
                        try await api.completePhoneCommand(receipt, channel: channel)
                        pending = nil
                        errorKey = nil
                    } else if let command = try await api.nextPhoneCommand(channel) {
                        try Task.checkCancellation()
                        guard current == generation else { return }
                        let receipt = await execute(command, channel: channel, api: api)
                        lastReceipt = receipt
                        pending = receipt
                    }
                } catch is CancellationError { throw CancellationError() }
                catch let error as CompanionError {
                    if case .unauthorized = error { throw error }
                    if case .rejected = error { throw error }
                    errorKey = "phone.error.connection"
                } catch { errorKey = "phone.error.connection" }
                try await Task.sleep(for: .seconds(1))
            }
        } catch {
            if !Task.isCancelled { errorKey = "phone.error.connection" }
        }
    }

    private func writeDiagnostics(_ phase: String) {
        #if DEBUG
        let record: DeviceToolJSON = .object([
            "phase": .string(phase), "enabled": .bool(channel != nil),
            "session_id": channel.map { .string($0.sessionId) } ?? .null,
            "error": errorKey.map(DeviceToolJSON.string) ?? .null,
        ])
        let path = URL.cachesDirectory.appendingPathComponent("phone-channel-verification.json")
        try? Data(record.formatted.utf8).write(to: path, options: [.atomic, .completeFileProtection])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
        #endif
    }

    private func execute(_ command: PhoneCommand, channel: PhoneChannel, api: MobileAPI) async -> PhoneReceipt {
        let worker = Task { @MainActor [client] in
            await client.execute(command, channel: channel)
        }
        let background = UIApplication.shared.beginBackgroundTask(withName: "Yun phone command") { worker.cancel() }
        guard background != .invalid else {
            worker.cancel()
            return PhoneReceipt(id: command.id, status: .failed, launched: false, returnedToYun: false)
        }
        defer { UIApplication.shared.endBackgroundTask(background) }
        let receipt = await withTaskCancellationHandler { await worker.value } onCancel: { worker.cancel() }
        // Submit while the finite background grant still covers an app switch.
        // Repeating this receipt is safe; repeating the action is not.
        try? await api.completePhoneCommand(receipt, channel: channel)
        #if DEBUG
        let record: DeviceToolJSON = .object([
            "session_id": .string(command.sessionId), "command_id": .string(command.id),
            "app": .string(command.app.rawValue), "status": .string(receipt.status.rawValue),
            "launched": .bool(receipt.launched), "returned_to_yun": .bool(receipt.returnedToYun),
            "completed_at": .string(Date().ISO8601Format()),
        ])
        let path = URL.cachesDirectory.appendingPathComponent("phone-web-verification.json")
        try? Data(record.formatted.utf8).write(to: path, options: [.atomic, .completeFileProtection])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
        #endif
        return receipt
    }
}
