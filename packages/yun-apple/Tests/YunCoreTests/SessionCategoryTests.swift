import Foundation
import Testing
@testable import YunCore

@Test func sessionCategoriesUseSourceInsteadOfTitles() {
    let qq = SessionSummary(
        id: "qq", title: "Renamed", updatedAt: .now, running: false,
        workspace: "Renamed workspace", provider: nil, model: nil,
        source: SessionSource(platform: "qq", kind: "group")
    )
    let native = SessionSummary(
        id: "native", title: "QQ", updatedAt: .now, running: false,
        workspace: "QQ · 群聊", provider: nil, model: nil
    )
    #expect(SessionCategory.all.includes(qq))
    #expect(SessionCategory.all.includes(native))
    #expect(SessionCategory.qq.includes(qq))
    #expect(!SessionCategory.qq.includes(native))
    #expect(qq.selecting(ModelRoute(provider: "openai", model: "example")).source == qq.source)
}

@Test func sessionsDecodeOldAndFutureSourceMetadata() throws {
    let base = #"""
    {"id":"session","title":"Example","updatedAt":"2026-11-07T00:00:00Z","running":false}
    """#
    let decoder = MobileJSON.decoder()
    let old = try decoder.decode(SessionSummary.self, from: Data(base.utf8))
    #expect(old.source == nil)
    #expect(SessionCategory.all.includes(old))
    #expect(!SessionCategory.qq.includes(old))

    let future = base.dropLast() + #", "source":{"platform":"future-platform","kind":"future-kind"}}"#
    let session = try decoder.decode(SessionSummary.self, from: Data(future.utf8))
    #expect(session.source?.platform == "future-platform")
    #expect(!SessionCategory.qq.includes(session))
    #expect(SessionCategory.all.includes(session))
}

@Test func archivedSessionsStayOutOfActiveCategoriesAndKeepTheirStateDuringModelSelection() throws {
    let data = Data(#"{"id":"archived","title":"History","updatedAt":"2026-11-07T00:00:00Z","running":false,"archived":true,"source":{"platform":"qq","kind":"group"}}"#.utf8)
    let session = try MobileJSON.decoder().decode(SessionSummary.self, from: data)
    #expect(!SessionCategory.all.includes(session))
    #expect(!SessionCategory.qq.includes(session))
    #expect(SessionCategory.archived.includes(session))
    #expect(session.selecting(ModelRoute(provider: "example", model: "test")).archived == true)
}

@Test func groupEntryHasNoDependencyOnConversationHistory() throws {
    let data = Data(#"{"id":"group-a","source":{"platform":"qq","kind":"group","name":"Test group"},"membership":"joined","allowed":true}"#.utf8)
    let group = try MobileJSON.decoder().decode(BotGroup.self, from: data)
    #expect(group.sessionId == nil)
    #expect(group.canOpen)
    #expect(group.displayTitle == "Test group")
    for json in [
        #"{"id":"group-a","source":{"platform":"qq"},"membership":"left","allowed":true}"#,
        #"{"id":"group-a","source":{"platform":"qq"},"membership":"joined","allowed":false}"#
    ] {
        #expect(!(try MobileJSON.decoder().decode(BotGroup.self, from: Data(json.utf8))).canOpen)
    }
}
