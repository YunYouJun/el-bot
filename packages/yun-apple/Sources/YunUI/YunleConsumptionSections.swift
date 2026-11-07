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

/// Item-driven sheet so the rules panel is reachable from any state of the summary.
private enum YunleConsumptionSheet: String, Identifiable {
    case info
    var id: String { rawValue }
}

struct YunleConsumptionSections: View {
    let summary: YunleConsumptionSummary
    let stale: Bool
    let syncedAt: Date?
    let busy: Bool
    let strings: YunStrings
    let reload: () -> Void
    @Environment(\.locale) private var locale
    // Sheets are hosted in a separate presentation hierarchy, so the app's
    // overridden Dynamic Type size must be propagated explicitly.
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var range: ConsumptionRange = .today
    @State private var sheet: YunleConsumptionSheet?
    private var period: YunleConsumptionPeriod { range.period(summary) }
    private var hasActivity: Bool {
        period.chargedMicroPoints != 0 || period.refundedMicroPoints != 0 || period.settlementCount != 0 || !period.models.isEmpty
    }
    private var asOf: Date { Date(timeIntervalSince1970: Double(summary.asOf) / 1000) }
    private var asOfText: String {
        // Date.FormatStyle defaults to the process locale, which ignores the app
        // language override; apply the SwiftUI environment locale explicitly while
        // keeping the server-provided time zone and the original asOf instant.
        asOf.formatted(
            Date.FormatStyle(date: .abbreviated, time: .shortened, timeZone: yunleConsumptionTimeZone(summary.timeZone))
                .locale(locale)
        )
    }

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 16) {
                Picker(strings["yunle.summary.range"], selection: $range) {
                    ForEach(ConsumptionRange.allCases) { item in Text(strings[item.titleKey]).tag(item) }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("yunleConsumptionRange")
                status
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
            }
            .padding(.vertical, 4)
            .sheet(item: $sheet) { _ in
                YunleConsumptionInfoView(strings: strings)
                    .environment(\.dynamicTypeSize, dynamicTypeSize)
                    .environment(\.locale, locale)
            }
        } header: {
            HStack(spacing: 8) {
                Text(strings["yunle.summary.title"])
                Spacer(minLength: 0)
                Button { sheet = .info } label: {
                    Image(systemName: "info.circle")
                        .font(.body)
                        .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(strings["yunle.summary.info"])
                .accessibilityHint(strings["yunle.summary.info_hint"])
                .accessibilityIdentifier("yunleConsumptionInfo")
            }
        } footer: { Text(strings["yunle.summary.hint"]) }

        if hasActivity {
            Section {
                ForEach(period.models) { model in
                    NavigationLink {
                        YunleModelDetailView(
                            model: model,
                            periodTitle: strings[range.titleKey],
                            asOf: asOf,
                            timeZone: summary.timeZone,
                            strings: strings
                        )
                    } label: {
                        YunleModelRow(model: model, strings: strings)
                    }
                    .accessibilityHint(strings["yunle.summary.detail_hint"])
                }
            } header: { Text("\(strings["yunle.summary.models"]) · \(strings[range.titleKey])") }
            footer: { Text(strings["yunle.summary.model_hint"]) }
        }
    }

    @ViewBuilder private var status: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label {
                Text("\(strings["yunle.summary.as_of"]) \(asOfText)")
            } icon: {
                Image(systemName: "clock")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("yunleSummaryAsOf")
            if let syncedAt {
                Label {
                    Text(strings["yunle.summary.account_sync"]) + Text(" ") + Text(syncedAt, style: .relative)
                } icon: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityElement(children: .combine)
            }
            if stale {
                VStack(alignment: .leading, spacing: 8) {
                    Label(strings["yunle.summary.stale"], systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(strings["yunle.retry"]) { reload() }
                        .font(.footnote)
                        .buttonStyle(.bordered)
                        .disabled(busy)
                        .accessibilityIdentifier("yunleSummaryRetry")
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("yunleSummaryStale")
            }
        }
    }

    private var netAmount: some View {
        Text(yunlePoints(period.netMicroPoints)).font(.largeTitle.weight(.semibold)).monospacedDigit()
    }
}

func yunleConsumptionTimeZone(_ identifier: String) -> TimeZone {
    TimeZone(identifier: identifier) ?? .current
}

private struct YunleModelRow: View {
    let model: YunleModelConsumption
    let strings: YunStrings

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(model.model ?? strings["yunle.summary.unattributed"])
                    .font(.subheadline.weight(.medium))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .layoutPriority(1)
                Spacer(minLength: 8)
                Text(yunlePoints(model.netMicroPoints))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .fixedSize(horizontal: true, vertical: false)
            }
            Text("\(strings["yunle.summary.gross"]) \(yunlePoints(model.chargedMicroPoints)) · \(strings["yunle.summary.refunded"]) \(yunlePoints(model.refundedMicroPoints))")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if model.model != nil {
                Text("\(strings["yunle.input"]) \(model.inputTokens.formatted()) · \(strings["yunle.output"]) \(model.outputTokens.formatted()) tokens")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            else {
                Text(strings["yunle.summary.missing"])
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
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
