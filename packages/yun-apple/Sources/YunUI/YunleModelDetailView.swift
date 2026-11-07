#if os(iOS)
import SwiftUI
import UIKit
import YunCore

/// Complete model summary for the selected server period. This is deliberately
/// not a transaction filter: the server exposes per-period model totals only.
struct YunleModelDetailView: View {
    let model: YunleModelConsumption
    let periodTitle: String
    let asOf: Date
    let timeZone: String
    let strings: YunStrings
    @Environment(\.locale) private var locale
    @State private var copied = false

    private var asOfText: String {
        // Date.FormatStyle defaults to the process locale, which ignores the app
        // language override; apply the SwiftUI environment locale explicitly while
        // keeping the server-provided time zone and the original asOf instant.
        asOf.formatted(
            Date.FormatStyle(date: .abbreviated, time: .shortened, timeZone: yunleConsumptionTimeZone(timeZone))
                .locale(locale)
        )
    }

    var body: some View {
        List {
            Section {
                if let identifier = model.model {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(strings["yunle.model.id"])
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(identifier)
                            .font(.footnote.monospaced())
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("yunleModelIdentifier")
                    }
                    Button {
                        UIPasteboard.general.string = identifier
                        copied = true
                    } label: {
                        Label(copied ? strings["yunle.model.copied"] : strings["yunle.model.copy"],
                              systemImage: copied ? "checkmark.circle" : "doc.on.doc")
                    }
                    .accessibilityLabel(strings["yunle.model.copy"])
                    .accessibilityValue(copied ? strings["yunle.model.copied"] : identifier)
                    .accessibilityIdentifier("yunleModelCopy")
                }
                else {
                    Text(strings["yunle.summary.unattributed"])
                        .font(.headline)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(strings["yunle.model.unattributed_detail"])
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("yunleModelUnattributedNote")
                }
            } header: { Text(strings["yunle.model.title"]) }

            Section {
                LabeledContent(strings["yunle.model.period"], value: periodTitle)
                LabeledContent(strings["yunle.summary.as_of"]) {
                    Text(asOfText).multilineTextAlignment(.trailing)
                }
            } footer: {
                Text(strings["yunle.summary.as_of_hint"])
                    .fixedSize(horizontal: false, vertical: true)
            }

            Section {
                amountRow(strings["yunle.summary.gross"], yunlePoints(model.chargedMicroPoints))
                amountRow(strings["yunle.summary.refunded"], yunlePoints(model.refundedMicroPoints))
                amountRow(strings["yunle.summary.net"], yunlePoints(model.netMicroPoints))
                amountRow(strings["yunle.summary.tasks"], model.settlementCount.formatted())
                if model.model == nil {
                    amountRow(strings["yunle.summary.unattributed_tasks"], model.unattributedCount.formatted())
                }
            } header: { Text(strings["yunle.model.amounts"]) }

            Section {
                if model.model == nil {
                    // The server returns zero placeholders for this bucket, so the
                    // figures must not be presented as real zero consumption.
                    Text(strings["yunle.model.tokens_unavailable"])
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("yunleModelTokensUnavailable")
                }
                else {
                    amountRow(strings["yunle.input"], model.inputTokens.formatted())
                    amountRow(strings["yunle.output"], model.outputTokens.formatted())
                }
            } header: { Text(strings["yunle.model.tokens"]) }
            footer: {
                VStack(alignment: .leading, spacing: 6) {
                    if model.model != nil {
                        Text(strings["yunle.model.token_note"])
                    }
                    Text(strings["yunle.model.summary_footer"])
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .navigationTitle(strings["yunle.model.detail_title"])
        .navigationBarTitleDisplayMode(.inline)
    }

    private func amountRow(_ label: String, _ value: String) -> some View {
        LabeledContent {
            Text(value).monospacedDigit().multilineTextAlignment(.trailing)
        } label: {
            Text(label)
        }
    }
}
#endif
