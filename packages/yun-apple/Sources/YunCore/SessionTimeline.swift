import Foundation

public enum SessionTimelinePeriod: Hashable, Sendable {
    case today
    case yesterday
    case lastSevenDays
    case lastThirtyDays
    case month(year: Int, month: Int)
}

public struct SessionTimelineSection: Identifiable, Sendable, Equatable {
    public let period: SessionTimelinePeriod
    public let sessions: [SessionSummary]

    public var id: String {
        switch period {
        case .today: "today"
        case .yesterday: "yesterday"
        case .lastSevenDays: "last-seven-days"
        case .lastThirtyDays: "last-thirty-days"
        case let .month(year, month): String(format: "month-%04d-%02d", year, month)
        }
    }
}

public enum SessionTimeline {
    public static func group(
        _ sessions: [SessionSummary],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [SessionTimelineSection] {
        let today = calendar.startOfDay(for: now)
        var result: [SessionTimelineSection] = []

        for session in sessions.sorted(by: { $0.updatedAt > $1.updatedAt }) {
            let date = calendar.startOfDay(for: session.updatedAt)
            let age = calendar.dateComponents([.day], from: date, to: today).day ?? 0
            let period: SessionTimelinePeriod
            switch age {
            case ...0:
                period = .today
            case 1:
                period = .yesterday
            case 2..<7:
                period = .lastSevenDays
            case 7..<30:
                period = .lastThirtyDays
            default:
                let parts = calendar.dateComponents([.year, .month], from: date)
                period = .month(year: parts.year ?? 0, month: parts.month ?? 0)
            }

            if let index = result.firstIndex(where: { $0.period == period }) {
                result[index] = SessionTimelineSection(period: period, sessions: result[index].sessions + [session])
            } else {
                result.append(SessionTimelineSection(period: period, sessions: [session]))
            }
        }
        return result
    }
}
