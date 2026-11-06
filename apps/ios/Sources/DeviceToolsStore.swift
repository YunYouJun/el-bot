import Foundation
import Observation
import UIKit
import YunCore

@MainActor @Observable final class DeviceToolsStore {
    private(set) var snapshot: DeviceToolJSON = .null
    private(set) var status: ICtrlStatus?
    private(set) var errorKey: String?
    private(set) var report: String?
    private(set) var elapsed: TimeInterval?
    private(set) var busy = false
    private(set) var sampleFound = false
    private(set) var operation: Operation?
    private let client = ICtrlClient()
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    enum Operation { case refresh, pair, read, smoke }

    func perform(_ operation: Operation) async {
        guard !busy else { return }
        busy = true
        self.operation = operation
        errorKey = nil
        defer {
            busy = false
            self.operation = nil
            #if DEBUG
            writeVerificationReceipt(operation)
            #endif
        }
        do {
            switch operation {
            case .refresh:
                refreshSnapshot()
                status = nil
                status = try await client.probe()
            case .pair:
                status = try await client.pair()
            case .read:
                sampleFound = false
                report = try await client.deviceInfo().formatted
                elapsed = nil
            case .smoke:
                try await runSmoke()
            }
        } catch {
            if !Task.isCancelled {
                errorKey = (error as? ICtrlError)?.localizationKey ?? "tools.error.execution"
                if operation == .refresh || error as? ICtrlError == .keyRejected { status = nil }
            }
        }
    }

    func clearReport() { report = nil; elapsed = nil; sampleFound = false }

    #if DEBUG
    /// Only acceptance metadata, never device contents, keys or page text.
    private func writeVerificationReceipt(_ operation: Operation) {
        let value: DeviceToolJSON = .object([
            "operation": .string(String(describing: operation)),
            "cancelled": .bool(Task.isCancelled),
            "paired": .bool(status?.paired == true),
            "error": errorKey.map(DeviceToolJSON.string) ?? .null,
            "elapsed": elapsed.map(DeviceToolJSON.number) ?? .null,
            "sample_found": .bool(sampleFound),
        ])
        let url = URL.cachesDirectory.appendingPathComponent("device-tools-verification.json")
        try? Data(value.formatted.utf8).write(to: url, options: [.atomic, .completeFileProtection])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    #endif

    private func refreshSnapshot() {
        let device = UIDevice.current
        let monitored = device.isBatteryMonitoringEnabled
        device.isBatteryMonitoringEnabled = true
        defer { device.isBatteryMonitoringEnabled = monitored }
        let thermal: String
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: thermal = "nominal"
        case .fair: thermal = "fair"
        case .serious: thermal = "serious"
        case .critical: thermal = "critical"
        @unknown default: thermal = "unknown"
        }
        var values: [String: DeviceToolJSON] = [
            "model": .string(device.model), "system": .string(device.systemName + " " + device.systemVersion),
            "low_power_mode": .bool(ProcessInfo.processInfo.isLowPowerModeEnabled),
            "thermal_state": .string(thermal), "captured_at": .string(Date().ISO8601Format()),
        ]
        if device.batteryLevel >= 0 { values["battery_percent"] = .number(Double(device.batteryLevel) * 100) }
        if let resources = try? URL.documentsDirectory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
           let bytes = resources.volumeAvailableCapacityForImportantUsage {
            values["available_storage_bytes"] = .number(Double(bytes))
        }
        snapshot = .object(values)
    }

    private func runSmoke() async throws {
        report = nil
        elapsed = nil
        sampleFound = false
        let started = Date()
        let worker = Task { @MainActor [client] () throws -> DeviceToolJSON in
            _ = try await client.deviceInfo()
            try Task.checkCancellation()
            try await client.openSamplePage()
            var page: DeviceToolJSON = .null
            for attempt in 0..<3 {
                try await Task.sleep(for: .milliseconds(attempt == 0 ? 1200 : 800))
                page = try await client.readSamplePage()
                if ICtrlClient.samplePageMatches(page) { break }
            }
            try Task.checkCancellation()
            // Return even when the page didn't expose its contents. That is a
            // failed read, not a reason to leave the user in another app.
            try await client.returnToYun()
            return page
        }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Yun device acceptance") { worker.cancel() }
        guard backgroundTask != .invalid else {
            worker.cancel()
            throw ICtrlError.execution
        }
        defer {
            if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask) }
            backgroundTask = .invalid
        }
        let page: DeviceToolJSON
        do {
            page = try await withTaskCancellationHandler { try await worker.value } onCancel: { worker.cancel() }
        } catch {
            if !Task.isCancelled && !worker.isCancelled { try? await client.returnToYun() }
            throw error
        }
        try Task.checkCancellation()
        elapsed = Date().timeIntervalSince(started)
        report = page.formatted
        sampleFound = ICtrlClient.samplePageMatches(page)
        guard sampleFound else { throw ICtrlError.execution }
    }
}
