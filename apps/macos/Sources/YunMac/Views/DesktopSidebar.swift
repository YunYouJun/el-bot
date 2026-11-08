import SwiftUI
import YunCore
import YunUI

struct DesktopSidebar: View {
    let desktop: DesktopStore
    let chat: ChatStore
    let sessions: [SessionSummary]
    @Binding var selection: DesktopRoot.Destination?
    @Binding var category: SessionCategory
    let showModelGuide: () -> Void

    var body: some View {
        List(selection: $selection) {
            Section {
                Label(desktop.text("web.title"), systemImage: "globe").tag(DesktopRoot.Destination.web)
                Label(desktop.text("tab.status"), systemImage: "antenna.radiowaves.left.and.right").tag(DesktopRoot.Destination.status)
                Label(desktop.text("personas"), systemImage: "person.crop.rectangle").tag(DesktopRoot.Destination.personas)
            }
            Section(desktop.text("sidebar.manage")) {
                Label(desktop.text("connect.title"), systemImage: "network").tag(DesktopRoot.Destination.cloud)
                Label(desktop.text("quickActions"), systemImage: "bolt").tag(DesktopRoot.Destination.quickActions)
            }
            if chat.device != nil {
                Section(desktop.text("tab.sessions")) {
                    SessionCategoryPicker(category: $category)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    Label(desktop.text("groups.title"), systemImage: "person.3").tag(DesktopRoot.Destination.groups)
                }
                GroupedSessionRows(sessions: sessions, store: chat, destination: DesktopRoot.Destination.session)
                if sessions.isEmpty {
                    Text(desktop.text("sessions.empty"))
                        .font(.callout).foregroundStyle(.secondary)
                        .listRowSeparator(.hidden)
                }
            }
        }
        .listStyle(.sidebar)
        .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 360)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack(spacing: 8) {
                Button(action: showModelGuide) {
                    Label(desktop.text("model.setup.title"), systemImage: "cpu")
                        .lineLimit(1)
                }
                .accessibilityIdentifier("openModelSetup")
                Spacer(minLength: 0)
                SettingsLink {
                    Label(desktop.text("settings"), systemImage: "gearshape")
                        .labelStyle(.iconOnly)
                }
                .help(desktop.text("settings"))
                .accessibilityIdentifier("openSettings")
            }
            .font(.callout)
            .buttonStyle(.borderless)
            .controlSize(.regular)
            .padding(.horizontal, 14).padding(.vertical, 10)
        }
    }
}
