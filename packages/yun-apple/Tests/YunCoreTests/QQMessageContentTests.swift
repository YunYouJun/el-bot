import Foundation
import Testing
@testable import YunCore

@Test func qqTagsBecomePassiveReadableContentWhileCodeStaysLiteral() {
    let source = """
    <qqbot-at-user id="alice" /> <qqbot-at-everyone /> <@!bob>
    <qqbot-cmd-input text="%2Fapprove%20yes" show="%E6%9F%A5%E7%9C%8B" />
    `<qqbot-cmd-enter text="/run" />`
    ```xml
    <qqbot-at-everyone />
    ```
    <qqimg>https://gchat.qpic.cn/photo.jpg</qqimg>
    <qqfile>/private/secret.pdf</qqfile>
    """
    let result = QQMessageContent.markdown(source, senderID: "alice", senderName: "Alice *QQ*", text: YunStrings(preference: "zh-Hans"))
    #expect(result.contains(#"**@Alice \*QQ\*** **@全体成员** **@bob**"#))
    #expect(result.contains("**查看**"))
    #expect(result.contains("`<qqbot-cmd-enter text=\"/run\" />`"))
    #expect(result.contains("```xml\n<qqbot-at-everyone />\n```"))
    #expect(result.contains("![图片](<https://gchat.qpic.cn/photo.jpg>)"))
    #expect(!result.contains("/private/secret.pdf"))
}

@Test func qqAttachmentImagesOnlyUseHTTPSQQCDNWithoutCredentials() {
    #expect(QQImageURL.parse("//multimedia.nt.qq.com/download?rkey=example")?.absoluteString == "https://multimedia.nt.qq.com/download?rkey=example")
    #expect(QQImageURL.parse("//multimedia.nt.qq.com.cn/download?rkey=example")?.absoluteString == "https://multimedia.nt.qq.com.cn/download?rkey=example")
    #expect(QQImageURL.parse("http://gchat.qpic.cn/photo.jpg")?.scheme == "https")
    for invalid in ["file:///private/photo.jpg", "https://127.0.0.1/a", "https://gchat.qpic.cn.attacker.invalid/a",
                    "https://multimedia.nt.qq.com.cn.attacker.invalid/a", "https://user:password@gchat.qpic.cn/a", "https://gchat.qpic.cn:8080/a", "data:image/png;base64,AAAA"] {
        #expect(QQImageURL.parse(invalid) == nil)
    }
    let result = QQMessageContent.markdown("<qqimg>file:///private/secret.png</qqimg>", text: YunStrings(preference: "en"))
    #expect(!result.contains("file:"))
    #expect(result.contains("Image"))
}

@Test func qqHistoryDecodesAttachmentsAndRemainsCompatibleWithOldRecords() throws {
    let base: [String: Any] = ["id": "incoming", "seq": 1, "direction": "incoming", "text": "photo", "kind": "attachment", "createdAt": "2026-11-07T00:00:00Z"]
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let old = try decoder.decode(GroupTransportMessage.self, from: JSONSerialization.data(withJSONObject: base))
    #expect(old.attachments == nil)
    var rich = base
    rich["attachments"] = [["kind": "image", "url": "https://gchat.qpic.cn/photo.jpg", "width": 1200, "height": 800],
                           ["kind": "file", "name": "notes.pdf"], ["kind": "image", "url": "https://localhost/private"]] as [[String: Any]]
    let message = try decoder.decode(GroupTransportMessage.self, from: JSONSerialization.data(withJSONObject: rich))
    #expect(message.attachments?.count == 3)
    #expect(message.attachments?[0].imageURL?.host == "gchat.qpic.cn")
    #expect(message.attachments?[1].name == "notes.pdf")
    #expect(message.attachments?[2].imageURL == nil)
}
