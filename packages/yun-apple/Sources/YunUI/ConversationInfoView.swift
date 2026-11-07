import SwiftUI
import YunCore

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

struct ConversationInfoView: View {
    let model: ConversationStore
    @Environment(\.yunStrings) private var text
    @Environment(\.dismiss) private var dismiss
    private var summary: SessionSummary { model.information ?? model.summary }
    private var source: SessionSource? { summary.source }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        if source?.platform == "qq" {
                            QQPlatformIcon().frame(width: 32, height: 32)
                        } else {
                            Image(systemName: "bubble.left.and.bubble.right").font(.title2).foregroundStyle(.tint)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(summary.displayTitle).font(.headline)
                            if let source {
                                Text("QQ · \(text[source.kind == "group" ? "sessions.kind.group" : "sessions.kind.direct"])")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                    if summary.displayTitle != summary.title { row("chat.info.topic", summary.title) }
                    LabeledContent(text["chat.info.state"], value: text[model.summary.running ? "chat.running" : "chat.info.idle"])
                    LabeledContent(text["chat.info.updated"]) {
                        Text(model.summary.updatedAt, format: .dateTime.year().month().day().hour().minute())
                    }
                }
                if source?.kind == "group" { groupInformation }
                Section(text["chat.info.configuration"]) {
                    if let workspace = summary.workspace { row("chat.info.workspace", workspace) }
                    if let route = model.currentModel {
                        row("chat.info.model", model.currentModelName)
                        row("chat.info.provider", route.provider)
                        if let effort = route.reasoningEffort { row("chat.info.reasoning", effort) }
                    }
                }
                ConversationContextSection(context: summary.context, loading: model.loadingInformation)
                Section {
                    identifier("chat.info.session_id", model.summary.id)
                    if let appId = source?.appId { identifier("chat.info.app_id", appId) }
                    if let peerId = source?.peerId {
                        identifier(source?.kind == "group" ? "chat.info.group_id" : "chat.info.user_id", peerId)
                    }
                } header: {
                    Text(text["chat.info.identifiers"])
                } footer: {
                    Text(text["chat.info.identifiers.detail"])
                }
                if model.loadingInformation {
                    HStack { ProgressView(); Text(text["chat.info.loading"]).foregroundStyle(.secondary) }
                }
                if let error = model.informationErrorKey {
                    Text(text[error]).font(.footnote).foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
            .navigationTitle(text["chat.info.title"])
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(text["chat.info.done"]) { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { Task { await model.loadInformation() } } label: {
                        Label(text["refresh"], systemImage: "arrow.clockwise")
                    }
                    .disabled(model.loadingInformation)
                }
            }
            .task { await model.loadInformation() }
        }
        #if os(macOS)
        .frame(minWidth: 460, idealWidth: 520, minHeight: 520, idealHeight: 680)
        #endif
    }

    @ViewBuilder private var groupInformation: some View {
        Section(text["chat.info.group"]) {
            if let name = source?.name { row("chat.info.name", name) }
            if let count = source?.memberCount { row("chat.info.members", count.formatted()) }
            if let category = source?.category { row("chat.info.category", category) }
            if let tags = source?.tags, !tags.isEmpty { row("chat.info.tags", tags.joined(separator: " · ")) }
            if let description = source?.description { row("chat.info.description", description) }
            availability(source?.groupInfoStatus)
        }
        Section(text["chat.info.bot"]) {
            if let bot = source?.bot {
                if let role = bot.role { row("chat.info.role", roleName(role)) }
                if let joined = bot.joinedAt {
                    LabeledContent(text["chat.info.joined"]) { Text(joined, format: .dateTime.year().month().day().hour().minute()) }
                }
                if let mode = bot.receiveMode { row("chat.info.receive_mode", text["chat.info.receive.\(mode)"]) }
                if let proactive = bot.allowProactive { row("chat.info.proactive", text[proactive ? "chat.info.allowed" : "chat.info.disallowed"]) }
            }
            availability(source?.botStateStatus)
        }
    }

    @ViewBuilder private func availability(_ status: String?) -> some View {
        if status != "available" {
            Text(text[status == "forbidden" ? "chat.info.forbidden" : "chat.info.not_loaded"])
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    private func roleName(_ role: String) -> String { text["chat.info.role.\(role)"] }

    private func row(_ key: String, _ value: String) -> some View {
        LabeledContent(text[key]) { Text(value).multilineTextAlignment(.trailing).textSelection(.enabled) }
    }

    private func identifier(_ key: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(text[key]).font(.subheadline).foregroundStyle(.secondary)
                Spacer()
                Button { copy(value) } label: { Label(text["chat.info.copy"], systemImage: "doc.on.doc") }
                    .labelStyle(.iconOnly).buttonStyle(.borderless)
                    .accessibilityLabel("\(text["chat.info.copy"]) \(text[key])")
            }
            Text(value).font(.caption.monospaced()).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 3)
    }

    private func copy(_ value: String) {
        #if os(iOS)
        UIPasteboard.general.string = value
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
        #endif
    }
}
