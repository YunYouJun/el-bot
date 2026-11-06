import Foundation
import Testing
@testable import YunCore

private let scopedSample: DeviceToolJSON = .object([
    "scope": .string("app"), "scoped_to": .string("com.google.chrome.ios"),
    "data": .string(Data([1, 2, 3]).base64EncodedString()),
])

@Test func sampleReadAcceptsOnlyTheBoundAppWhenForegroundLookupIsUnavailable() throws {
    let device: DeviceToolJSON = .object(["system": .object(["screen_locked": .bool(false)])])
    #expect(try ICtrlBrowserSample.imageData(scopedSample, deviceInfo: device) == Data([1, 2, 3]))
}

@Test func sampleReadRejectsFullScreenFallbackAndLockedDevice() {
    let unlocked: DeviceToolJSON = .object(["system": .object(["screen_locked": .bool(false)])])
    let locked: DeviceToolJSON = .object(["system": .object(["screen_locked": .bool(true)])])
    let differentForeground: DeviceToolJSON = .object(["system": .object([
        "screen_locked": .bool(false), "foreground_app": .string("com.apple.MobileSMS"),
    ])])
    let fullScreen: DeviceToolJSON = .object(["scope": .string("screen"), "data": .string("AQID")])
    let otherApp: DeviceToolJSON = .object(["scope": .string("app"), "scoped_to": .string("com.apple.MobileSMS"), "data": .string("AQID")])
    #expect(throws: (any Error).self) { try ICtrlBrowserSample.imageData(fullScreen, deviceInfo: unlocked) }
    #expect(throws: (any Error).self) { try ICtrlBrowserSample.imageData(otherApp, deviceInfo: unlocked) }
    #expect(throws: (any Error).self) { try ICtrlBrowserSample.imageData(scopedSample, deviceInfo: locked) }
    #expect(throws: (any Error).self) { try ICtrlBrowserSample.imageData(scopedSample, deviceInfo: differentForeground) }
    #expect(throws: (any Error).self) { try ICtrlBrowserSample.imageData(scopedSample, deviceInfo: .null) }
}

@Test func sampleReadRequiresBodyTextRatherThanOnlyTheBrowserTabTitle() {
    #expect(!ICtrlBrowserSample.containsPageBody("Tab: Example Domain · example.com"))
    #expect(ICtrlBrowserSample.containsPageBody("Example Domain\nThis domain is for use in documentation examples."))
    #expect(!ICtrlClient.samplePageMatches(.object([
        "bundle_id": .string(ICtrlBrowserSample.bundleID), "source": .string("Example Domain"),
        "hint": .string("Read documentation"),
    ])))
}
