import SwiftUI
import YunCore

private struct OpenDSHManagementKey: EnvironmentKey {
    static let defaultValue: (@MainActor @Sendable () -> Void)? = nil
}

public extension EnvironmentValues {
    var openDSHManagement: (@MainActor @Sendable () -> Void)? {
        get { self[OpenDSHManagementKey.self] }
        set { self[OpenDSHManagementKey.self] = newValue }
    }
}

struct ConversationContextSection: View {
    let context: SessionContext?
    let loading: Bool
    @Environment(\.yunStrings) private var text
    @Environment(\.openDSHManagement) private var openManagement
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Section {
            if let context {
                usage(context)
                if let policy = context.policy {
                    LabeledContent(text["context.automatic"], value: text[policy.automatic ? "context.enabled" : "context.disabled"])
                    if policy.automatic {
                        LabeledContent(text["context.threshold"], value: policy.thresholdRatio.formatted(.percent.precision(.fractionLength(0...1))))
                        if let tokens = policy.retainTokens {
                            LabeledContent(text["context.retained"], value: tokens.formatted(.number.precision(.fractionLength(0))) + " tokens")
                        } else if let ratio = policy.retainRatio {
                            LabeledContent(text["context.retained"], value: ratio.formatted(.percent.precision(.fractionLength(0...1))))
                        }
                    }
                    if policy.source == "preset" {
                        Label(text["context.preset"], systemImage: "info.circle")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                } else {
                    Text(text["context.policy_unavailable"]).font(.footnote).foregroundStyle(.secondary)
                }
            } else if loading {
                HStack(spacing: 8) { ProgressView(); Text(text["chat.info.loading"]) }
                    .foregroundStyle(.secondary)
            } else {
                Text(text["context.unavailable"]).foregroundStyle(.secondary)
            }
            if let openManagement {
                Button {
                    dismiss()
                    openManagement()
                } label: {
                    Label(text["context.manage"], systemImage: "globe")
                }
                .accessibilityIdentifier("contextOpenDSH")
            }
        } header: {
            Label(text["context.title"], systemImage: "memorychip")
        } footer: {
            Text(text["context.detail"])
        }
        .accessibilityIdentifier("conversationContext")
    }

    @ViewBuilder private func usage(_ context: SessionContext) -> some View {
        if let occupancy = context.occupancy, let used = context.usedTokens, let capacity = context.contextWindow {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(text["context.usage"])
                    Spacer()
                    Text(occupancy, format: .percent.precision(.fractionLength(1)))
                        .monospacedDigit().foregroundStyle(.secondary)
                }
                ProgressView(value: min(occupancy, 1), total: 1)
                    .tint(occupancy >= 1 ? Color.orange : Color.accentColor)
                    .accessibilityLabel(text["context.usage"])
                    .accessibilityValue(occupancy.formatted(.percent.precision(.fractionLength(1))))
                Text("≈ \(used.formatted(.number.precision(.fractionLength(0)))) / \(capacity.formatted(.number.precision(.fractionLength(0)))) tokens")
                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    .accessibilityIdentifier("contextTokenUsage")
            }.padding(.vertical, 4)
        } else if let used = context.usedTokens {
            LabeledContent(text["context.usage"], value: "≈ " + used.formatted(.number.precision(.fractionLength(0))) + " tokens")
        } else {
            Text(text["context.waiting"]).font(.footnote).foregroundStyle(.secondary)
        }
    }
}

#Preview("Cloud context") {
    let context = try! JSONDecoder().decode(SessionContext.self, from: Data(#"{"usedTokens":14500,"contextWindow":1048576,"usageSource":"projected","policy":{"automatic":true,"thresholdRatio":0.8,"headroomTokens":65536,"retainRatio":0.16,"source":"active","preset":"standard"}}"#.utf8))
    NavigationStack {
        Form { ConversationContextSection(context: context, loading: false) }
            .navigationTitle("会话信息")
    }
    .environment(\.yunStrings, YunStrings(preference: "zh-Hans"))
    .environment(\.openDSHManagement, {})
}

#Preview("Older server") {
    Form { ConversationContextSection(context: nil, loading: false) }
        .environment(\.yunStrings, YunStrings(preference: "zh-Hans"))
        .environment(\.openDSHManagement, {})
}
