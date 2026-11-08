import SwiftUI
import YunCore

private struct OpenModelSetupGuideKey: EnvironmentKey {
    static let defaultValue: (@MainActor @Sendable () -> Void)? = nil
}

public extension EnvironmentValues {
    var openModelSetupGuide: (@MainActor @Sendable () -> Void)? {
        get { self[OpenModelSetupGuideKey.self] }
        set { self[OpenModelSetupGuideKey.self] = newValue }
    }
}

public struct ModelSetupGuide: View {
    let connected: Bool
    let openCloud: () -> Void
    @Environment(\.yunStrings) private var text
    @Environment(\.dismiss) private var dismiss

    public init(connected: Bool, openCloud: @escaping () -> Void) {
        self.connected = connected
        self.openCloud = openCloud
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label(text["model.setup.cloud"], systemImage: "cloud")
                    Text(text["model.setup.intro"]).foregroundStyle(.secondary)
                }
                Section(text["model.setup.steps"]) {
                    step(1, title: "model.setup.step1", detail: "model.setup.step1.detail")
                    step(2, title: "model.setup.step2", detail: "model.setup.step2.detail")
                    step(3, title: "model.setup.step3", detail: "model.setup.step3.detail")
                }
                Section(text["model.setup.points"]) {
                    Text(text["model.setup.points.detail"]).foregroundStyle(.secondary)
                    Text(text["model.setup.points.scope"]).font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    Button {
                        dismiss()
                        openCloud()
                    } label: {
                        Label(text["model.setup.open_cloud"], systemImage: "globe")
                    }
                    .disabled(!connected)
                    .accessibilityIdentifier("modelSetupOpenCloud")
                } footer: {
                    if !connected { Text(text["model.setup.connect_first"]) }
                }
                Section(text["model.setup.selection"]) {
                    detail(title: "model.setup.session", body: "model.setup.session.detail")
                    detail(title: "model.setup.default", body: "model.setup.default.detail")
                }
                Section(text["model.setup.storage"]) {
                    Label(text["model.setup.storage.detail"], systemImage: "lock.shield")
                    Text(text["model.setup.device.detail"]).foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
            .navigationTitle(text["model.setup.title"])
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(text["model.setup.done"]) { dismiss() }
                        .accessibilityIdentifier("modelSetupDone")
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 520, idealWidth: 560, minHeight: 560, idealHeight: 680)
        #endif
    }

    private func step(_ number: Int, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "\(number).circle.fill")
                .foregroundStyle(.tint).font(.title3).accessibilityHidden(true)
            self.detail(title: title, body: detail)
        }.padding(.vertical, 4)
    }

    private func detail(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text[title]).font(.headline)
            Text(text[body]).font(.subheadline).foregroundStyle(.secondary)
        }.fixedSize(horizontal: false, vertical: true)
    }
}

struct ModelSetupHint: View {
    @Environment(\.yunStrings) private var text
    @Environment(\.openModelSetupGuide) private var openGuide
    @AppStorage("yun.modelSetupHint.dismissed") private var dismissed = false

    var body: some View {
        if !dismissed {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top) {
                        Label(text["model.setup.hint.title"], systemImage: "cloud")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        Button {
                            dismissed = true
                        } label: {
                            Image(systemName: "xmark").padding(6)
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(text["model.setup.hint.dismiss"])
                        .accessibilityIdentifier("modelSetupHintDismiss")
                    }
                    Text(text["model.setup.hint.detail"]).font(.footnote).foregroundStyle(.secondary)
                    Button(text["model.setup.view_guide"]) {
                        dismissed = true
                        openGuide?()
                    }
                    .buttonStyle(.borderless)
                    .accessibilityIdentifier("modelSetupHintGuide")
                }.padding(.vertical, 4)
            }
        }
    }
}

#Preview {
    ModelSetupGuide(connected: true, openCloud: {})
        .environment(\.yunStrings, YunStrings(preference: "zh-Hans"))
}
