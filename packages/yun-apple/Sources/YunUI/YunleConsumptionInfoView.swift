#if os(iOS)
import SwiftUI
import YunCore

/// Long-form explanation of how Yun consumption is counted. Presented as an
/// item-driven sheet so it never competes for space with the compact summary.
struct YunleConsumptionInfoView: View {
    let strings: YunStrings
    @Environment(\.dismiss) private var dismiss

    private struct Item: Identifiable {
        let titleKey: String
        let bodyKey: String
        var id: String { titleKey }
    }

    private static let items: [Item] = [
        Item(titleKey: "yunle.summary.info_scope_title", bodyKey: "yunle.summary.info_scope"),
        Item(titleKey: "yunle.summary.info_account_title", bodyKey: "yunle.summary.info_account"),
        Item(titleKey: "yunle.summary.info_time_title", bodyKey: "yunle.summary.info_time"),
        Item(titleKey: "yunle.summary.info_refund_title", bodyKey: "yunle.summary.info_refund"),
        Item(titleKey: "yunle.summary.info_negative_title", bodyKey: "yunle.summary.info_negative"),
        Item(titleKey: "yunle.summary.info_allocation_title", bodyKey: "yunle.summary.info_allocation"),
        Item(titleKey: "yunle.summary.info_tokens_title", bodyKey: "yunle.summary.info_tokens"),
        Item(titleKey: "yunle.summary.info_unattributed_title", bodyKey: "yunle.summary.info_unattributed"),
        Item(titleKey: "yunle.summary.info_models_title", bodyKey: "yunle.summary.info_models"),
        Item(titleKey: "yunle.summary.info_pagination_title", bodyKey: "yunle.summary.info_pagination"),
    ]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(strings["yunle.summary.info_intro"])
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(Self.items) { item in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(strings[item.titleKey]).font(.subheadline.weight(.semibold))
                            Text(strings[item.bodyKey])
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, 2)
                        .accessibilityElement(children: .combine)
                    }
                } footer: {
                    Text(strings["yunle.summary.as_of_hint"])
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .navigationTitle(strings["yunle.summary.info_title"])
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(strings["done"]) { dismiss() }
                        .accessibilityIdentifier("yunleConsumptionInfoClose")
                }
            }
        }
    }
}
#endif
