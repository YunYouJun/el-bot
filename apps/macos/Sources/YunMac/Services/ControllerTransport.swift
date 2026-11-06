import Foundation
import Darwin
import YunCore

/// Owns one private controller process. Neither shell strings nor credential contents cross this boundary.
final class ControllerTransport: @unchecked Sendable {
    enum Update: Sendable { case snapshot(ClientSnapshot), pairing(server: String, code: String, purpose: String, expiresAt: Date), failed }
    private struct Header: Decodable { let type: String? }
    private struct Pairing: Decodable { let server: String; let code: String; let purpose: String; let expiresAt: String }
    private let process = Process()
    private let input = Pipe()
    private let output = Pipe()
    private let writes = DispatchQueue(label: "cn.elpsy.yun.controller.write")
    private let lock = NSLock()
    private var stopped = false
    private var queued = 0
    private let receive: @MainActor @Sendable (Update) -> Void

    init(settingsPath: String?, executableURL: URL? = nil, receive: @escaping @MainActor @Sendable (Update) -> Void) throws {
        self.receive = receive
        guard let executable = executableURL ?? Bundle.main.resourceURL?.appendingPathComponent("yun-controller") else { throw TransportError.unavailable }
        process.executableURL = executable
        process.arguments = settingsPath.map { ["--settings", $0] } ?? []
        var environment = ProcessInfo.processInfo.environment
        environment["YUN_SYSTEM_LOCALE"] = Locale.preferredLanguages.first ?? "en"
        process.environment = environment
        process.standardInput = input
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        try process.run()
        DispatchQueue(label: "cn.elpsy.yun.controller.read").async { [self] in readSnapshots() }
    }

    func send(_ event: ClientEvent) throws {
        let bytes = try event.encodedLine()
        lock.lock()
        guard !stopped, queued < 64 else { lock.unlock(); throw TransportError.unavailable }
        queued += 1
        lock.unlock()
        writes.async { [self] in
            defer { lock.lock(); queued -= 1; lock.unlock() }
            lock.lock(); let closed = stopped; lock.unlock()
            guard !closed else { return }
            do { try input.fileHandleForWriting.write(contentsOf: bytes) }
            catch { fail() }
        }
    }

    func stop() {
        lock.lock()
        guard !stopped else { lock.unlock(); return }
        stopped = true
        lock.unlock()
        // Closing only this pipe terminates the UI controller, never the independent bot.
        try? input.fileHandleForWriting.close()
        if process.isRunning { process.terminate() }
    }

    private func readSnapshots() {
        var framer = SnapshotFramer()
        do {
            var bytes = [UInt8](repeating: 0, count: 32_768)
            while true {
                // Foundation's sized read can wait for a full buffer on a pipe.
                // One POSIX read delivers even the first small snapshot immediately.
                let count = Darwin.read(output.fileHandleForReading.fileDescriptor, &bytes, bytes.count)
                if count == 0 { break }
                if count < 0 {
                    if errno == EINTR { continue }
                    throw TransportError.unavailable
                }
                let data = Data(bytes.prefix(count))
                for frame in try framer.append(data) {
                    if try JSONDecoder().decode(Header.self, from: frame).type == "chat-pairing" {
                        let pairing = try JSONDecoder().decode(Pairing.self, from: frame)
                        let formatter = ISO8601DateFormatter()
                        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                        guard pairing.server == "https://bot.yunle.fun", ["", "phone"].contains(pairing.purpose),
                              let expires = formatter.date(from: pairing.expiresAt),
                              PairingCode.normalize(pairing.code).range(of: "^[A-HJ-NP-Z2-9]{8}$", options: .regularExpression) != nil else { throw TransportError.unavailable }
                        Task { @MainActor [receive] in receive(.pairing(server: pairing.server, code: pairing.code, purpose: pairing.purpose, expiresAt: expires)) }
                        continue
                    }
                    let snapshot = try JSONDecoder().decode(ClientSnapshot.self, from: frame)
                    guard ["", "stop", "restart"].contains(snapshot.confirmation) else { throw TransportError.unavailable }
                    Task { @MainActor [receive] in receive(.snapshot(snapshot)) }
                }
            }
            try framer.finish()
            lock.lock(); let expected = stopped; lock.unlock()
            if !expected { fail() }
        } catch { fail() }
    }

    private func fail() {
        lock.lock(); let expected = stopped; lock.unlock()
        guard !expected else { return }
        stop()
        Task { @MainActor [receive] in receive(.failed) }
    }

    enum TransportError: Error { case unavailable }
}
