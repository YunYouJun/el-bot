import Foundation
import Testing
@testable import YunCore

private func channel(now: Date) throws -> PhoneChannel {
    let value = """
    {"channel":"\(String(repeating: "a", count: 43))","sessionId":"phone-session","apps":["chrome"],"expiresAt":"\(now.addingTimeInterval(600).ISO8601Format())"}
    """
    return try MobileJSON.decoder().decode(PhoneChannel.self, from: Data(value.utf8))
}

private func command(now: Date, session: String = "phone-session", app: String = "chrome", after: TimeInterval = 20) throws -> PhoneCommand {
    let value = """
    {"id":"phone-session:call-1","sessionId":"\(session)","app":"\(app)","returnToYun":true,"expiresAt":"\(now.addingTimeInterval(after).ISO8601Format())"}
    """
    return try MobileJSON.decoder().decode(PhoneCommand.self, from: Data(value.utf8))
}

@Test func phoneCommandsRequireTheLocalSessionAppAndDeadline() throws {
    let now = Date()
    let lease = try channel(now: now)
    try lease.validate(now: now)
    try command(now: now).validate(for: lease, now: now)
    #expect(throws: CompanionError.invalidResponse) { try command(now: now, session: "someone-else").validate(for: lease, now: now) }
    #expect(throws: CompanionError.invalidResponse) { try command(now: now, app: "settings").validate(for: lease, now: now) }
    #expect(throws: CompanionError.invalidResponse) { try command(now: now, after: -1).validate(for: lease, now: now) }
    #expect(throws: CompanionError.invalidResponse) { try command(now: now, after: 60).validate(for: lease, now: now) }
    #expect(throws: CompanionError.invalidResponse) { try lease.validate(now: now.addingTimeInterval(601)) }
    #expect(throws: (any Error).self) { try command(now: now, app: "shell") }
}

@Test func cloudPhoneReceiptsNeverContainTheLocalRunnerKey() throws {
    let receipt = PhoneReceipt(id: "call-1", status: .succeeded, launched: true, returnedToYun: true)
    let data = try JSONEncoder().encode(receipt)
    let keys = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    #expect(Set(keys.keys) == Set(["id", "status", "launched", "returnedToYun"]))
    #expect(PhoneApp.chrome.bundleID == "com.google.chrome.ios")
    #expect(PhoneApp.allCases.count == 3)
}

@Test func phoneLaunchRejectsSystemAlertsAndAnotherForegroundApp() {
    let bundle = PhoneApp.chrome.bundleID
    let message: DeviceToolJSON = .string("Opened \(bundle).")
    #expect(ICtrlClient.didOpenApp(.object(["message": message]), bundleID: bundle))
    #expect(ICtrlClient.didOpenApp(.object(["message": message, "foreground_app": .string(bundle)]), bundleID: bundle))
    #expect(!ICtrlClient.didOpenApp(.object(["message": message, "foreground_app": .string("com.apple.Preferences")]), bundleID: bundle))
    #expect(!ICtrlClient.didOpenApp(.object(["message": message, "system_alert": .bool(true)]), bundleID: bundle))
    #expect(!ICtrlClient.didOpenApp(.object(["message": .string("Asked to open")]), bundleID: bundle))
}
