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
    private var hasActivity: Bool {
        period.chargedMicroPoints != 0 || period.refundedMicroPoints != 0 || period.settlementCount != 0 || !period.models.isEmpty
    }

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 18) {
                Picker(strings["yunle.summary.range"], selection: $range) {
                    ForEach(ConsumptionRange.allCases) { item in Text(strings[item.titleKey]).tag(item) }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("yunleConsumptionRange")
                if hasActivity {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(strings["yunle.summary.net"]).font(.subheadline).foregroundStyle(.secondary)
                        ViewThatFits(in: .horizontal) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                netAmount
                                Text(strings["yunle.summary.unit"]).font(.subheadline).foregroundStyle(.secondary)
                            }
                            VStack(alignment: .leading, spacing: 4) {
                                netAmount
                                Text(strings["yunle.summary.unit"]).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }.accessibilityElement(children: .combine)
                    }
                    YunleConsumptionMetrics(period: period, strings: strings)
                }
                else {
                    Label(strings["yunle.summary.empty"], systemImage: "chart.bar.xaxis")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 6)
                        .accessibilityIdentifier("yunleConsumptionEmpty")
                }
            }.padding(.vertical, 4)
        } header: { Text(strings["yunle.summary.title"]) }
        footer: { Text(strings["yunle.summary.hint"]) }

        if hasActivity {
            Section {
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

    private var netAmount: some View {
        Text(yunlePoints(period.netMicroPoints)).font(.largeTitle.weight(.semibold)).monospacedDigit()
    }
}

private struct YunleConsumptionMetrics: View {
    let period: YunleConsumptionPeriod
    let strings: YunStrings

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 20) {
                metric("yunle.summary.gross", value: yunlePoints(period.chargedMicroPoints))
                Spacer(minLength: 0)
                metric("yunle.summary.refunded", value: yunlePoints(period.refundedMicroPoints), muted: period.refundedMicroPoints == 0)
                Spacer(minLength: 0)
                metric("yunle.summary.tasks", value: period.settlementCount.formatted())
            }
            VStack(spacing: 8) {
                LabeledContent(strings["yunle.summary.gross"], value: yunlePoints(period.chargedMicroPoints))
                LabeledContent(strings["yunle.summary.refunded"], value: yunlePoints(period.refundedMicroPoints))
                    .foregroundStyle(period.refundedMicroPoints == 0 ? .secondary : .primary)
                LabeledContent(strings["yunle.summary.tasks"], value: period.settlementCount.formatted())
            }.font(.subheadline)
        }
    }

    private func metric(_ key: String, value: String, muted: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(strings[key]).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.subheadline.weight(.medium)).monospacedDigit()
                .foregroundStyle(muted ? .secondary : .primary)
        }
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityElement(children: .combine)
    }
}
#endif
