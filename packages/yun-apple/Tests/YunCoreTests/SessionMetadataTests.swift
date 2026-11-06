import Foundation
import Testing
@testable import YunCore

@Test func enrichedQQMetadataDecodesWithoutLosingIdentityDuringModelSelection() throws {
    let json = #"""
    {
      "id":"session","title":"Generated topic","updatedAt":"2026-11-07T00:00:00Z","running":false,
      "source":{
        "platform":"qq","kind":"group","appId":"123","peerId":"group-openid","name":"读书群",
        "memberCount":6,"tags":["读书"],"groupInfoStatus":"available","botStateStatus":"available",
        "bot":{"joinedAt":"2026-01-01T00:00:00Z","role":"member","receiveMode":"all","allowProactive":false},
        "lastMessage":{"id":"qq-message","senderId":"member-openid","senderName":"小明","senderRole":"admin","senderIsBot":false,"text":"你好","createdAt":"2026-11-07T00:00:00Z","type":"text"}
      }
    }
    """#
    let summary = try MobileJSON.decoder().decode(SessionSummary.self, from: Data(json.utf8))
    #expect(summary.displayTitle == "读书群")
    #expect(summary.source?.memberCount == 6)
    #expect(summary.source?.bot?.allowProactive == false)
    #expect(summary.source?.lastMessage?.senderRole == "admin")
    #expect(summary.source?.lastMessage?.createdAt == summary.updatedAt)
    let selected = summary.selecting(ModelRoute(provider: "openai", model: "test"))
    #expect(selected.source == summary.source)
    #expect(selected.id == summary.id)
    #expect(selected.title == "Generated topic")
}
