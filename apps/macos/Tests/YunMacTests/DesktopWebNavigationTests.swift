import Foundation
import Testing
@testable import YunMac

@Test func embeddedWebNavigationStaysOnItsPairedLoopbackOrigin() throws {
    let origin = try #require(URL(string: "http://127.0.0.1:49152"))
    for value in ["http://127.0.0.1:49152/", "http://127.0.0.1:49152/?view=models#settings"] {
        #expect(DesktopWebNavigation.allows(try #require(URL(string: value)), origin: origin))
    }
    for value in ["http://127.0.0.1:49153/", "https://bot.yunle.fun/", "file:///etc/hosts",
                  "http://attacker.test/", "http://user:password@127.0.0.1:49152/",
                  "http://127.0.0.1:49152/?token=launch", "http://127.0.0.1:49152/?%74oken=launch"] {
        #expect(!DesktopWebNavigation.allows(try #require(URL(string: value)), origin: origin))
    }
    #expect(DesktopWebNavigation.allows(try #require(URL(string: "about:blank")), origin: nil))
    #expect(!DesktopWebNavigation.allows(origin, origin: nil))
}

@Test func authorizationPopupAcceptsOnlyTheDeepSeekAuthorizationEndpoint() throws {
    #expect(DesktopWebNavigation.isAuthorization(try #require(URL(string: "https://platform.deepseek.com/dsh/authorize?state=test"))))
    for value in ["https://platform.deepseek.com.attacker.test/dsh/authorize",
                  "https://platform.deepseek.com/dsh/authorized", "http://platform.deepseek.com/dsh/authorize",
                  "https://platform.deepseek.com:444/dsh/authorize", "https://platform.deepseek.com/dsh/authorize#token",
                  "https://user:password@platform.deepseek.com/dsh/authorize"] {
        #expect(!DesktopWebNavigation.isAuthorization(try #require(URL(string: value))))
    }
}

@Test func externalLinksDoNotLaunchFilesOrApplications() throws {
    #expect(DesktopWebNavigation.isExternalLink(try #require(URL(string: "https://example.com/help"))))
    for value in ["file:///Applications/Terminal.app", "javascript:alert(1)", "yun://run",
                  "https://user:password@example.com/"] {
        #expect(!DesktopWebNavigation.isExternalLink(try #require(URL(string: value))))
    }
}
