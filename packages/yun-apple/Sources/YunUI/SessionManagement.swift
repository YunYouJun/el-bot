import SwiftUI
import YunCore

struct SessionManagement: ViewModifier {
    let session: SessionSummary
    let store: ChatStore?
    @Environment(\.yunStrings) private var text
    private enum DeleteStage { case preparing, final }
    @State private var stage: DeleteStage?
    @State private var deletion: DeletionConfirmation?

    func body(content: Content) -> some View {
        content
            .contextMenu { if let store { actions(store) } }
            #if os(iOS)
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if let store { actions(store, isSwipeAction: true) }
            }
            #endif
            .alert(text["sessions.delete.final"], isPresented: Binding(
                get: { stage == .final },
                set: { if !$0 && stage != .preparing { stage = nil; deletion = nil } }
            )) {
                if let deletion {
                    Button(text["sessions.delete"], role: .destructive) {
                        let token = deletion.confirmation
                        Task { await store?.delete(session.id, confirmation: token) }
                    }
                }
                Button(text["cancel"], role: .cancel) { stage = nil; deletion = nil }
            } message: {
                Text(session.displayTitle + "\n" + text["sessions.delete.final_detail"])
            }
            .task(id: stage) {
                guard stage == .preparing else { return }
                let confirmation = await store?.prepareDeletion(session.id)
                guard stage == .preparing, !Task.isCancelled else { return }
                deletion = confirmation
                stage = confirmation == nil ? nil : .final
            }
    }

    @ViewBuilder private func actions(_ store: ChatStore, isSwipeAction: Bool = false) -> some View {
        Button {
            Task { await store.archive(session) }
        } label: {
            Label(text[session.archived == true ? "sessions.restore" : "sessions.archive"],
                  systemImage: session.archived == true ? "tray.and.arrow.up" : "archivebox")
        }
        .tint(.orange)
        .disabled(store.busy || session.running)
        // A destructive swipe removes the row before confirmation and tears down its alert state.
        Button(role: isSwipeAction ? nil : .destructive) { stage = .preparing } label: {
            Label(text["sessions.delete"], systemImage: "trash")
        }
        .tint(.red)
        .disabled(store.busy || session.running)
    }
}

public struct BotGroupsView: View {
    let store: ChatStore
    let onOpen: (String) -> Void
    @Environment(\.yunStrings) private var text
    @State private var groups: [BotGroup] = []
    @State private var loading = false
    @State private var errorKey: String?

    public init(store: ChatStore, onOpen: @escaping (String) -> Void) {
        self.store = store
        self.onOpen = onOpen
    }

    public var body: some View {
        List {
            Section { Text(text["groups.scope"]).font(.footnote).foregroundStyle(.secondary) }
            if let errorKey { Label(text[errorKey], systemImage: "exclamationmark.circle") }
            if groups.isEmpty && !loading {
                ContentUnavailableView(text["groups.empty"], systemImage: "person.3")
            }
            ForEach(groups) { group in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        QQPlatformIcon().frame(width: 24, height: 24)
                        Text(group.displayTitle).font(.headline)
                        Spacer()
                        Text(text["groups.membership." + group.membership]).font(.caption).foregroundStyle(.secondary)
                    }
                    if let count = group.source.memberCount {
                        LabeledContent(text["chat.info.members"], value: String(count)).font(.subheadline)
                    }
                    Button(text[group.sessionId == nil ? "groups.start" : "groups.open"]) {
                        Task {
                            if let id = await store.openGroup(group.id) { onOpen(id) }
                            else { errorKey = store.errorKey }
                        }
                    }
                    .disabled(!group.canOpen || store.busy)
                    .accessibilityIdentifier("openGroup.\(group.id)")
                }.padding(.vertical, 6)
            }
        }
        .navigationTitle(text["groups.title"])
        .overlay { if loading && groups.isEmpty { ProgressView() } }
        .task { await refresh() }
        .refreshable { await refresh() }
        .toolbar { Button { Task { await refresh() } } label: { Label(text["refresh"], systemImage: "arrow.clockwise") }.disabled(loading) }
    }

    private func refresh() async {
        guard let client = store.client, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let items = try await client.groups()
            guard !Task.isCancelled, store.client === client else { return }
            groups = items.sorted { $0.displayTitle.localizedStandardCompare($1.displayTitle) == .orderedAscending }
            errorKey = nil
        } catch {
            guard !Task.isCancelled else { return }
            errorKey = (error as? CompanionError)?.localizationKey ?? "error.unavailable"
        }
    }
}
