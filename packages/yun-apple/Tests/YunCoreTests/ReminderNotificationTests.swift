import Foundation
import Testing
@testable import YunCore

@Test func reminderRegistrationEncodesBinaryDeviceTokensWithoutDescriptions() throws {
    let registration = ReminderNotificationRegistration(token: Data([0, 1, 15, 128, 255]), environment: "sandbox")
    let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(registration)) as? [String: String]
    #expect(json == ["token": "00010f80ff", "environment": "sandbox"])
}

@Test func notificationReceiptsKeepAcceptanceDistinctFromDelivery() throws {
    let json = #"{"configured":true,"registered":true,"lastReceipt":{"status":"accepted","at":"2026-11-09T07:00:01.414Z"}}"#
    let status = try MobileJSON.decoder().decode(ReminderNotificationStatus.self, from: Data(json.utf8))
    #expect(status.configured)
    #expect(status.registered)
    #expect(status.lastReceipt?.status == "accepted")
    #expect(status.lastReceipt?.code == nil)
}
