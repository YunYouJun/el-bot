import Foundation
import Testing
@testable import YunCore

@Test func qqAvatarURLUsesBotAppIDAndOpenID() {
    #expect(QQAvatarURL.make(appId: "1024", openId: "ABC_def-1", size: 100)?.absoluteString
        == "https://q.qlogo.cn/qqapp/1024/ABC_def-1/100")
    #expect(QQAvatarURL.make(appId: "1024", openId: "ABC", size: 640)?.absoluteString
        == "https://q.qlogo.cn/qqapp/1024/ABC/640")
    #expect(QQAvatarURL.make(appId: "test", openId: "abc", size: 0)?.absoluteString
        == "https://q.qlogo.cn/qqapp/test/abc/0")
}

@Test func qqAvatarURLRejectsUnsafeOrIncompleteIdentifiers() {
    #expect(QQAvatarURL.make(appId: nil, openId: "abc") == nil)
    #expect(QQAvatarURL.make(appId: "1024", openId: nil) == nil)
    #expect(QQAvatarURL.make(appId: "1024", openId: "") == nil)
    for appId in ["", "10/24", "10 24", "应用"] {
        #expect(QQAvatarURL.make(appId: appId, openId: "abc") == nil)
    }
    for openId in ["abc/def", "abc def", "abc?x=1", "abc#fragment", String(repeating: "a", count: 129)] {
        #expect(QQAvatarURL.make(appId: "1024", openId: openId) == nil)
    }
    for size in [-1, 1, 200, 641] {
        #expect(QQAvatarURL.make(appId: "1024", openId: "abc", size: size) == nil)
    }
}

@Test func qqImageURLAllowsAvatarCDNWithoutWideningOtherHosts() {
    #expect(QQImageURL.parse("https://q.qlogo.cn/qqapp/1024/ABC_def-1/100")?.host == "q.qlogo.cn")
    #expect(QQImageURL.parse("https://q.qlogo.cn.attacker.invalid/qqapp/1024/ABC/100") == nil)
}
