import XCTest

@MainActor
final class CompanionUITests: XCTestCase {
    func testPairWithCloudAndSwitchLanguage() throws {
        continueAfterFailure = false
        let code = ProcessInfo.processInfo.environment["YUNBOT_PAIRING_CODE"]
        guard let code, !code.isEmpty else { throw XCTSkip("Set a fresh private pairing code in the test runner environment") }
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        if app.textFields["pairingCode"].waitForExistence(timeout: 8) {
            let field = app.textFields["pairingCode"]
            field.tap()
            field.typeText(code)
            app.swipeUp()
            app.buttons["pairDevice"].tap()
        }
        let connected = app.buttons["Status"].waitForExistence(timeout: 25)
        attach(app, name: "Pairing result")
        XCTAssertTrue(connected)
        XCTAssertTrue(app.buttons["newSession"].exists)
        attach(app, name: "Conversations")
        try verifyModelContext(app)
        app.buttons["Status"].tap()
        XCTAssertTrue(app.staticTexts["102275406"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["QQ connected"].waitForExistence(timeout: 15))
        attach(app, name: "QQ connected")
        app.buttons["Settings"].tap()
        app.buttons["languagePicker"].tap()
        app.buttons["简体中文"].tap()
        XCTAssertTrue(app.buttons["会话"].waitForExistence(timeout: 5))
        attach(app, name: "Chinese settings")
        app.buttons["会话"].tap()
        attach(app, name: "Chinese conversations")
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["会话"].waitForExistence(timeout: 15), "Pairing persists in Keychain after restart")
    }

    private func verifyModelContext(_ app: XCUIApplication) throws {
        let nonce = "IOS-" + UUID().uuidString.prefix(8)
        app.buttons["newSession"].tap()
        let input = app.descendants(matching: .any).matching(identifier: "messageInput").firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        input.tap()
        input.typeText("Remember the verification code " + nonce + ". Reply READY only. Do not use tools.")
        app.buttons["sendMessage"].tap()
        XCTAssertTrue(app.staticTexts["READY"].waitForExistence(timeout: 90))
        input.tap()
        input.typeText("What was the verification code? Return only that exact code. Do not use tools.")
        app.buttons["sendMessage"].tap()
        XCTAssertTrue(app.staticTexts[String(nonce)].waitForExistence(timeout: 90))
        attach(app, name: "Native model context verified")
        app.navigationBars.buttons.element(boundBy: 0).tap()
    }

    private func attach(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
