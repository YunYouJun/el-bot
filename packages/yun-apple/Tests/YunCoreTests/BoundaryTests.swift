import Foundation
import Testing
@testable import YunCore

@Test func fragmentedSnapshotsAndCoalescedReads() throws {
    var framer = SnapshotFramer()
    #expect(try framer.append(Data("{\"page\":".utf8)).isEmpty)
    let frames = try framer.append(Data("\"personas\"}\n{}\n".utf8))
    #expect(frames.map { String(decoding: $0, as: UTF8.self) } == ["{\"page\":\"personas\"}", "{}"])
    try framer.finish()
}

@Test func oversizedAndTruncatedStreamsFailClosed() throws {
    var framer = SnapshotFramer()
    _ = try framer.append(Data(repeating: 65, count: SnapshotFramer.maximumFrameBytes))
    #expect(throws: ProtocolError.frameTooLarge) { try framer.append(Data([65])) }
    var truncated = SnapshotFramer()
    _ = try truncated.append(Data("{}".utf8))
    #expect(throws: ProtocolError.incompleteFrame) { try truncated.finish() }
}

@Test func cloudAddressCannotPersistLoginSecretsOrUntrustedSchemes() throws {
    for invalid in ["http://example.com", "https://user:secret@example.com", "https://example.com/?token=secret", "https://example.com/#token", "file:///etc/passwd", "https:///", "javascript:alert(1)"] {
        #expect(throws: CloudAddress.InvalidAddress.self) { try CloudAddress(invalid) }
    }
    let address = try CloudAddress(" https://example.com/dsh/ ")
    #expect(address.url.absoluteString == "https://example.com/dsh/")
    #expect(address.personasURL.absoluteString == "https://example.com/dsh/#el-bot-personas")
}

@Test func eventBoundaryIsMeasuredAfterJSONEncoding() {
    #expect(throws: ProtocolError.eventTooLarge) {
        try ClientEvent("edit", String(repeating: "中", count: 6000), field: "configPath").encodedLine()
    }
}
