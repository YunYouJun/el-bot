import Foundation
import Testing
import YunCore
@testable import YunMac

@Test(.timeLimit(.minutes(1))) @MainActor
func receivesSmallSnapshotBeforeControllerClosesOutput() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let executable = directory.appendingPathComponent("controller")
    let json = String(decoding: try JSONEncoder().encode(ClientSnapshot()), as: UTF8.self)
    let quoted = "'" + json.replacingOccurrences(of: "'", with: "'\\''") + "'"
    try "#!/bin/sh\nprintf '%s\\n' \(quoted)\nread -r event\n".write(to: executable, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: executable.path)
    let (updates, continuation) = AsyncStream<ControllerTransport.Update>.makeStream()
    let controller = try ControllerTransport(settingsPath: nil, executableURL: executable) { continuation.yield($0) }
    defer { controller.stop(); continuation.finish() }
    var iterator = updates.makeAsyncIterator()
    guard case .snapshot(let snapshot) = await iterator.next() else {
        Issue.record("The first small snapshot did not arrive while the controller was idle")
        return
    }
    #expect(snapshot.page == .quickActions)
}
