#if os(iOS)
import SwiftUI
import YunCore

private enum ConsumptionRange: String, CaseIterable, Identifiable {
    case today, month, lifetime
    var id: String { rawValue }
    var titleKey: String { "yunle.summary.\(rawValue)" }
    func period(_ summary: YunleConsumptionSummary) -> YunleConsumptionPeriod {
        switch self {
        case .today: summary.today
        case .month: summary.month
        case .lifetime: summary.lifetime
        }
    }
}

struct YunleConsumptionSections: View {
    let summary: YunleConsumptionSummary
    let strings: YunStrings
    @State private var range: ConsumptionRange = .today
    private var period: YunleConsumptionPeriod { range.period(summary) }

    var body: some View {
        Section {
            Picker(strings["yunle.summary.range"], selection: $range) {
                ForEach(ConsumptionRange.allCases) { item in Text(strings[item.titleKey]).tag(item) }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("yunleConsumptionRange")
            VStack(alignment: .leading, spacing: 6) {
                Text(strings["yunle.summary.net"]).font(.subheadline).foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(yunlePoints(period.netMicroPoints)).font(.largeTitle.weight(.semibold)).monospacedDigit()
                    Text(strings["yunle.summary.unit"]).font(.subheadline).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            }.padding(.vertical, 8)
            LabeledContent(strings["yunle.summary.gross"], value: yunlePoints(period.chargedMicroPoints))
            LabeledContent(strings["yunle.summary.refunded"], value: yunlePoints(period.refundedMicroPoints))
            LabeledContent(strings["yunle.summary.tasks"], value: period.settlementCount.formatted())
        } header: { Text(strings["yunle.summary.title"]) }
        footer: { Text(strings["yunle.summary.hint"]) }

        Section {
            if period.models.isEmpty {
                Text(strings["yunle.summary.empty"]).foregroundStyle(.secondary)
            }
            ForEach(period.models) { model in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(model.model ?? strings["yunle.summary.unattributed"]).font(.subheadline.weight(.medium)).lineLimit(nil)
                        Spacer(minLength: 0)
                        Text(yunlePoints(model.netMicroPoints)).font(.headline.monospacedDigit()).fixedSize(horizontal: true, vertical: false)
                    }
                    Text("\(strings["yunle.summary.gross"]) \(yunlePoints(model.chargedMicroPoints)) · \(strings["yunle.summary.refunded"]) \(yunlePoints(model.refundedMicroPoints))")
                        .font(.caption).foregroundStyle(.secondary)
                    if model.model != nil {
                        Text("\(strings["yunle.input"]) \(model.inputTokens.formatted()) · \(strings["yunle.output"]) \(model.outputTokens.formatted()) tokens")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    else {
                        Text(strings["yunle.summary.missing"]).font(.caption).foregroundStyle(.secondary)
                    }
                }.padding(.vertical, 6)
                .accessibilityElement(children: .combine)
            }
        } header: { Text("\(strings["yunle.summary.models"]) · \(strings[range.titleKey])") }
        footer: { Text(strings["yunle.summary.model_hint"]) }
    }
}
#endif
