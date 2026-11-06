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
