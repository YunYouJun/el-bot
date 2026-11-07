import SwiftUI
import YunCore

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

struct GroupRoleBadge: View {
    let role: String
    @Environment(\.yunStrings) private var text

    private var tint: Color {
        switch role {
        case "owner": .orange
        case "admin": .blue
        default: .secondary
        }
    }

    var body: some View {
        Text(text["chat.info.role.\(role)"])
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(tint, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
    }
}

struct GroupSenderInfoView: View {
    let message: GroupTransportMessage
    let role: String?
    let appId: String?
    let sessionId: String
    let client: MobileAPI
    @Environment(\.yunStrings) private var text
    @Environment(\.dismiss) private var dismiss
    @State private var impression: GroupMemberImpression?
    @State private var impressionState: ImpressionState = .loading
    @State private var retry = 0

    private enum ImpressionState: Equatable {
        case loading
        case loaded
        case failed
    }

    private var displayName: String {
        if let name = message.senderName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
            return name
        }
        return String(message.senderId?.prefix(12) ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        QQAvatar(appId: appId, openId: message.senderId, name: message.senderName, size: 56)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(displayName).font(.title3.weight(.semibold))
                            HStack(spacing: 6) {
                                Image(systemName: "person.2.fill").font(.caption2)
                                Text(text["chat.sender.subtitle"]).font(.caption)
                                if let role {
                                    GroupRoleBadge(role: role)
                                }
                            }
                            .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                    .accessibilityElement(children: .combine)
                }
                if let impression {
                    Section(text["chat.sender.impression"]) {
                        Text(impression.text)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 4) {
                            Text(text["chat.sender.impression.updated"])
                            Text(impression.updatedAt, format: .dateTime.year().month().day().hour().minute())
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                } else if impressionState == .failed {
                    Section {
                        Label(text["chat.sender.impression.failed"], systemImage: "exclamationmark.circle")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Button(text["refresh"]) { retry += 1 }
                            .font(.footnote)
                    }
                }
                Section(text["chat.info.identifiers"]) {
                    if let senderId = message.senderId {
                        identifier("chat.info.sender_id", senderId)
                    }
                    if let appId {
                        identifier("chat.info.app_id", appId)
                    }
                }
                Section(text["chat.sender.message"]) {
                    row("chat.info.message_type", text["chat.message.\(message.kind)"])
                    LabeledContent(text["chat.sender.sent_at"]) {
                        Text(message.createdAt, format: .dateTime.year().month().day().hour().minute())
                    }
                    if let messageId = message.messageId {
                        identifier("chat.info.message_id", messageId)
                    }
                }
            }
            .formStyle(.grouped)
            .task(id: "\(message.senderId ?? "")-\(retry)") {
                await loadImpression()
            }
            .navigationTitle(text["chat.sender.title"])
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(text["chat.info.done"]) { dismiss() }
                }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        #elseif os(macOS)
        .frame(minWidth: 420, idealWidth: 480, minHeight: 420, idealHeight: 520)
        #endif
    }

    private func row(_ key: String, _ value: String) -> some View {
        LabeledContent(text[key]) { Text(value).multilineTextAlignment(.trailing) }
    }

    private func identifier(_ key: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(text[key]).font(.subheadline).foregroundStyle(.secondary)
                Spacer()
                Button { copy(value) } label: {
                    Label(text["chat.info.copy"], systemImage: "doc.on.doc")
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
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

    private func loadImpression() async {
        guard let senderId = message.senderId else {
            impression = nil
            impressionState = .loaded
            return
        }
        impressionState = .loading
        do {
            let profile = try await client.groupMember(sessionId, senderId: senderId)
            guard profile.senderId == senderId else { throw CompanionError.invalidResponse }
            impression = profile.impression
            impressionState = .loaded
        } catch {
            impression = nil
            impressionState = .failed
        }
    }
}
