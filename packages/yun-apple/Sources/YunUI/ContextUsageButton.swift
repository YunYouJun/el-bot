import SwiftUI
import YunCore

struct ContextUsageButton: View {
    let context: SessionContext?
    let action: () -> Void
    @Environment(\.yunStrings) private var text

    private var value: String {
        context?.occupancy?.formatted(.percent.precision(.fractionLength(1))) ?? "—"
    }

    var body: some View {
        Button(action: action) {
            #if os(macOS)
            if context?.occupancy == nil {
                Image(systemName: "info.circle")
            } else {
                indicator.frame(width: 24, height: 24)
            }
            #else
            indicator.frame(width: 32, height: 32)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
            #endif
        }
        #if os(macOS)
        .buttonStyle(.automatic)
        #else
        .buttonStyle(.plain)
        #endif
        .accessibilityLabel(text["context.usage"])
        .accessibilityValue(context?.occupancy == nil ? text["context.unavailable"] : value)
        .accessibilityHint(text["context.open_details"])
        .accessibilityIdentifier("conversationInfo")
        .help(text["context.title"])
    }

    private var indicator: some View {
        ZStack {
            Circle().stroke(Color.secondary.opacity(0.18), lineWidth: 3)
            if let occupancy = context?.occupancy {
                Circle()
                    .trim(from: 0, to: min(occupancy, 1))
                    .stroke(occupancy >= 1 ? Color.orange : Color.accentColor,
                            style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Text(value)
                .font(.system(size: 9, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundStyle(.primary)
                .lineLimit(1).minimumScaleFactor(0.6)
                .padding(3)
        }
    }
}

#Preview {
    let context = try! JSONDecoder().decode(SessionContext.self, from: Data(#"{"usedTokens":14500,"contextWindow":1048576}"#.utf8))
    HStack(spacing: 20) {
        ContextUsageButton(context: context, action: {})
        ContextUsageButton(context: nil, action: {})
    }.padding()
}
