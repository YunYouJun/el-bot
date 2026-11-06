import Foundation
import XCTest
@testable import YunCore

final class ConnectionTests: XCTestCase {
    func testNormalizesSmartKeyboardPairingSeparators() {
        for separator in ["-", "–", "—", "−", "‑", " "] {
            XCTAssertEqual(PairingCode.normalize(" abcd" + separator + "efgh "), "ABCDEFGH")
        }
    }

    func testOnlyAcceptsAnHTTPSOrigin() throws {
        XCTAssertEqual(try Endpoint(" https://BOT.example.test/ ").absoluteString, "https://bot.example.test")
        for input in ["http://bot.example.test", "https://user:password@example.test", "https://example.test?token=x", "https://example.test/path", "https://example.test/#key", "not a server"] {
            XCTAssertThrowsError(try Endpoint(input), input)
        }
    }

    func testDecodesNodeTimestampsWithAndWithoutMilliseconds() throws {
        for value in ["2026-11-06T00:00:00.123Z", "2026-11-06T00:00:00Z"] {
            let data = Data(("{\"id\":\"device\",\"name\":\"iPhone\",\"createdAt\":\"" + value + "\",\"expiresAt\":\"2026-12-06T00:00:00.000Z\"}").utf8)
            let device = try MobileJSON.decoder().decode(Device.self, from: data)
            XCTAssertEqual(device.name, "iPhone")
            XCTAssertLessThan(device.createdAt, device.expiresAt)
        }
    }
}
