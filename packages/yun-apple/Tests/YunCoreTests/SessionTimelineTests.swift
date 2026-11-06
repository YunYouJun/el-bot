import Foundation
import Testing
@testable import YunCore

private let timelineCalendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    return calendar
}()

private func timelineDate(_ year: Int, _ month: Int, _ day: Int, hour: Int = 12) -> Date {
    timelineCalendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
}

private func timelineSession(_ id: String, _ date: Date) -> SessionSummary {
    SessionSummary(id: id, title: id, updatedAt: date, running: false, workspace: nil, provider: nil, model: nil)
}

@Test func sessionTimelineMatchesDeepSeekHistoryBuckets() {
    let now = timelineDate(2026, 3, 15)
    let sessions = [
        timelineSession("future", timelineDate(2026, 3, 16)),
        timelineSession("today", timelineDate(2026, 3, 15, hour: 8)),
        timelineSession("yesterday", timelineDate(2026, 3, 14)),
        timelineSession("six-days", timelineDate(2026, 3, 9)),
        timelineSession("seven-days", timelineDate(2026, 3, 8)),
        timelineSession("twenty-nine-days", timelineDate(2026, 2, 14)),
        timelineSession("thirty-days", timelineDate(2026, 2, 13)),
        timelineSession("older", timelineDate(2026, 1, 20)),
    ]

    let sections = SessionTimeline.group(sessions, now: now, calendar: timelineCalendar)

    #expect(sections.map(\.period) == [
        .today,
        .yesterday,
        .lastSevenDays,
        .lastThirtyDays,
        .month(year: 2026, month: 2),
        .month(year: 2026, month: 1),
    ])
    #expect(sections.map { $0.sessions.map(\.id) } == [
        ["future", "today"],
        ["yesterday"],
        ["six-days"],
        ["seven-days", "twenty-nine-days"],
        ["thirty-days"],
        ["older"],
    ])
}

@Test func sessionTimelineSortsEachBucketNewestFirst() {
    let now = timelineDate(2026, 3, 15)
    let sections = SessionTimeline.group([
        timelineSession("old-today", timelineDate(2026, 3, 15, hour: 1)),
        timelineSession("new-today", timelineDate(2026, 3, 15, hour: 23)),
    ], now: now, calendar: timelineCalendar)

    #expect(sections.count == 1)
    #expect(sections[0].sessions.map(\.id) == ["new-today", "old-today"])
}

@Test func sessionTimelineUsesStableUniqueIdentifiers() {
    let sections = SessionTimeline.group([
        timelineSession("recent", timelineDate(2026, 3, 15)),
        timelineSession("old", timelineDate(2025, 12, 12)),
    ], now: timelineDate(2026, 3, 15), calendar: timelineCalendar)

    #expect(sections.map(\.id) == ["today", "month-2025-12"])
}
