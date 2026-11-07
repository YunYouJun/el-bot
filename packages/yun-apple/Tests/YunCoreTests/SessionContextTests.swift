import Foundation
import Testing
@testable import YunCore

private func contextSession(_ context: String = "") throws -> SessionSummary {
    let json = """
    {"id":"s","title":"Chat","updatedAt":"2026-11-07T00:00:00Z","running":false,"provider":"p","model":"m"\(context)}
    """
    return try MobileJSON.decoder().decode(SessionSummary.self, from: Data(json.utf8))
}

@Test func contextInformationAcceptsOlderServersAndUnknownCapacity() throws {
    #expect(try contextSession().context == nil)
    let session = try contextSession(#", "context":{"usedTokens":14500,"usageSource":"projected"}"#)
    #expect(session.context?.usedTokens == 14500)
    #expect(session.context?.occupancy == nil)
}

@Test func contextOccupancyPreservesOverflowAndClearsOnModelSwitch() throws {
    let session = try contextSession(#", "context":{"usedTokens":120,"contextWindow":100,"policy":{"automatic":true,"thresholdRatio":0.8,"headroomTokens":10,"retainRatio":0.16,"source":"active"}}"#)
    #expect(session.context?.occupancy == 1.2)
    #expect(session.context?.policy?.automatic == true)
    #expect(session.settingArchived(true).context == session.context)
    #expect(session.selecting(ModelRoute(provider: "p", model: "m")).context == session.context)
    #expect(session.selecting(ModelRoute(provider: "p", model: "other")).context == nil)
    #expect(try contextSession(#", "context":{"usedTokens":0,"contextWindow":0}"#).context?.occupancy == nil)
}
