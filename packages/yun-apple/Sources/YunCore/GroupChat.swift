import Foundation
import Observation

public struct GroupTransportMessage: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let seq: Int
    public let direction: String
    public let text: String
    public let kind: String
    public let createdAt: Date
    public let senderId: String?
    public let senderName: String?
    public let senderRole: String?
    public let manual: Bool?
    public let status: String?
    public let messageId: String?
    public let attachments: [GroupMessageAttachment]?
    public var outgoing: Bool { direction == "outgoing" }
}
public struct GroupMessageAttachment: Decodable, Sendable, Hashable {
    public let kind: String
    public let name: String?
    public let contentType: String?
    public let size: Int?
    public let width: Int?
    public let height: Int?
    public let url: String?
    public var imageURL: URL? { kind == "image" ? QQImageURL.parse(url) : nil }
}
public struct GroupMemberImpression: Decodable, Sendable, Hashable {
    public let text: String
    public let updatedAt: Date
}
public struct GroupMemberProfile: Decodable, Sendable {
    public let senderId: String
    public let impression: GroupMemberImpression?
}
public struct GroupHandoffLease: Decodable, Sendable, Equatable {
    public let id: String
    public let expiresAt: Double
    public let phase: String
    public var expiry: Date { Date(timeIntervalSince1970: expiresAt / 1000) }
}
public struct GroupHandoff: Decodable, Sendable, Equatable {
    public let id: String
    public let sessionId: String
    public let lease: GroupHandoffLease?
    public let replyAvailable: Bool
    public let proactivePermission: String
}
public struct GroupDelivery: Decodable, Sendable, Equatable {
    public let id: String
    public let status: String
    public let messageId: String?
    public let code: String?
}
public struct GroupChatState: Decodable, Sendable, Equatable {
    public let context: SessionContext?
    public let messages: [GroupTransportMessage]
    public let cursor: Int
    public let hasMore: Bool
    public let captureStartedAt: Date
    public let online: Bool
    public let now: Double
    public let control: GroupHandoff?
    public let deliveries: [GroupDelivery]

    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.context == rhs.context && lhs.messages == rhs.messages && lhs.cursor == rhs.cursor
            && lhs.hasMore == rhs.hasMore && lhs.captureStartedAt == rhs.captureStartedAt
            && lhs.online == rhs.online && lhs.control == rhs.control && lhs.deliveries == rhs.deliveries
    }
}
public struct GroupSendPreview: Decodable, Sendable, Identifiable {
    public let id: String
    public let target: String
    public let title: String
    public let scope: String
    public let text: String
    public let mode: String
    public let expiresAt: Double
}
public struct GroupChatRequest: Encodable, Sendable {
    public let operation: String
    public var lease: String?
    public var text: String?
    public var mode: String?
    public var preview: String?
    public init(_ operation: String, lease: String? = nil, text: String? = nil, mode: String? = nil, preview: String? = nil) {
        self.operation = operation; self.lease = lease; self.text = text; self.mode = mode; self.preview = preview
    }
}
public struct GroupChatResponse: Decodable, Sendable {
    public let state: GroupChatState?
    public let preview: GroupSendPreview?
    public let delivery: GroupDelivery?
}

@MainActor
private enum GroupChatSnapshots {
    struct Value {
        let messages: [GroupTransportMessage]
        let cursor: Int?
        let hasMore: Bool
    }
    private static let limit = 8
    private static let messageLimit = 200
    private static var values: [String: Value] = [:]
    private static var order: [String] = []

    static func value(for key: String) -> Value? {
        guard let value = values[key] else { return nil }
        order.removeAll { $0 == key }
        order.append(key)
        return value
    }

    static func store(messages: [GroupTransportMessage], cursor: Int?, hasMore: Bool, for key: String) {
        var kept = messages
        var keptHasMore = hasMore
        if kept.count > messageLimit {
            kept = Array(kept.suffix(messageLimit))
            keptHasMore = true
        }
        values[key] = Value(messages: kept, cursor: kept.first?.seq ?? cursor, hasMore: keptHasMore)
        order.removeAll { $0 == key }
        order.append(key)
        while order.count > limit {
            values.removeValue(forKey: order.removeFirst())
        }
    }

    static func remove(_ key: String) {
        values.removeValue(forKey: key)
        order.removeAll { $0 == key }
    }

    static func removeAll() {
        values.removeAll()
        order.removeAll()
    }
}

@MainActor @Observable public final class GroupChatStore {
    public let summary: SessionSummary
    public private(set) var state: GroupChatState?
    public private(set) var messages: [GroupTransportMessage] = []
    public private(set) var busy = false
    @ObservationIgnored public private(set) var loading = false
    public private(set) var initialLoading = true
    public private(set) var errorKey: String?
    public private(set) var hasMore = false
    public private(set) var pending: PendingMessage?
    public var draft = ""
    public var mode = "reply"
    public let client: MobileAPI
    private let outbox: PendingMessages
    @ObservationIgnored private let snapshotKey: String
    private var restored = false
    private var cursor: Int?
    private var revision = 0
    public var manual: Bool { state?.control?.lease?.phase == "active" }
    public var pausing: Bool { state?.control?.lease?.phase == "pausing" }
    public var canSend: Bool {
        manual && state?.online == true && !busy && pending == nil && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && draft.utf16.count <= 1200 && (mode == "proactive" || state?.control?.replyAvailable == true)
    }
    private var outboxId: String { "qq-manual-" + summary.id }

    public init(session: SessionSummary, client: MobileAPI, outbox: PendingMessages = PendingMessages()) {
        summary = session; self.client = client; self.outbox = outbox
        snapshotKey = "\(client.endpoint.absoluteString)\u{0}\(session.id)"
        if let snapshot = GroupChatSnapshots.value(for: snapshotKey) {
            messages = snapshot.messages
            cursor = snapshot.cursor
            hasMore = snapshot.hasMore
        }
    }
    static func clearSnapshots() {
        GroupChatSnapshots.removeAll()
    }
    public func refresh(older: Bool = false) async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        let revision = self.revision
        do {
            if !restored {
                pending = try await outbox.load(origin: client.endpoint.absoluteString, sessionId: outboxId)
                restored = true
            }
            let value = try await client.groupChat(summary.id, before: older ? cursor : nil)
            guard !Task.isCancelled, revision == self.revision else { return }
            initialLoading = false
            if state != value { state = value }
            if older {
                let ids = Set(messages.map(\.id))
                let merged = value.messages.filter { !ids.contains($0.id) } + messages
                if merged != messages { messages = merged }
            } else {
                let ids = Set(value.messages.map(\.id))
                let merged = messages.filter { !ids.contains($0.id) && $0.seq < (value.messages.first?.seq ?? 0) } + value.messages
                if merged != messages { messages = merged }
            }
            if older || cursor == nil { cursor = value.cursor; hasMore = value.hasMore }
            GroupChatSnapshots.store(messages: messages, cursor: cursor, hasMore: hasMore, for: snapshotKey)
            if errorKey != nil { errorKey = nil }
            if let pending, let receipt = value.deliveries.first(where: { $0.id == pending.requestId }) {
                try await reconcile(receipt)
            }
        } catch {
            if !Task.isCancelled { initialLoading = false }
            if error as? CompanionError == .rejected("session_not_found") {
                messages = []; state = nil; draft = ""
                GroupChatSnapshots.remove(snapshotKey)
                try? await outbox.remove(origin: client.endpoint.absoluteString, sessionId: outboxId)
                pending = nil
            }
            handle(error)
        }
    }
    public func takeover() async { await change(GroupChatRequest("begin")) }
    public func resume() async {
        guard let lease = state?.control?.lease else { return }
        await change(GroupChatRequest("end", lease: lease.id))
    }
    private func change(_ request: GroupChatRequest) async {
        guard !busy else { return }
        revision += 1
        busy = true
        defer { busy = false }
        do {
            let result = try await client.groupChat(summary.id, request: request)
            guard !Task.isCancelled else { return }
            if let state = result.state { self.state = state }
            errorKey = nil
        } catch { handle(error) }
    }
    public func send() async {
        guard canSend, let lease = state?.control?.lease else { return }
        busy = true
        defer { busy = false }
        let original = draft
        let sendMode = mode
        let target = state?.control?.id
        do {
            let result = try await client.groupChat(summary.id, request: GroupChatRequest("preview", lease: lease.id, text: original, mode: sendMode))
            guard !Task.isCancelled else { return }
            guard let preview = result.preview, preview.text == original, preview.mode == sendMode, preview.scope == "group", preview.target == target else {
                throw CompanionError.invalidResponse
            }
            let message = PendingMessage(sessionId: outboxId, text: original, requestId: preview.id)
            do { try await outbox.save(message, origin: client.endpoint.absoluteString) }
            catch { errorKey = "error.storage"; return }
            pending = message
            await deliver(message)
        } catch { handle(error) }
    }
    public func retry() async {
        guard let pending, !busy else { return }
        busy = true
        defer { busy = false }
        await deliver(pending)
    }
    private func deliver(_ pending: PendingMessage) async {
        revision += 1
        do {
            let result = try await client.groupChat(summary.id, request: GroupChatRequest("send", preview: pending.requestId))
            guard let delivery = result.delivery, delivery.id == pending.requestId else { throw CompanionError.invalidResponse }
            try await reconcile(delivery)
            await refresh()
        } catch {
            if let error = error as? CompanionError, case .rejected(let code) = error,
               ["preview_expired", "lease_expired", "stale_session", "reply_expired"].contains(code) {
                draft = pending.text
                try? await outbox.remove(origin: client.endpoint.absoluteString, sessionId: outboxId)
                self.pending = nil
            }
            handle(error)
        }
    }
    public func acknowledgeUnknown() async {
        guard let pending, !busy else { return }
        do {
            try await outbox.remove(origin: client.endpoint.absoluteString, sessionId: outboxId)
            draft = pending.text
            self.pending = nil
        } catch { errorKey = "error.storage" }
    }
    private func reconcile(_ receipt: GroupDelivery) async throws {
        guard let pending, receipt.id == pending.requestId else { return }
        if receipt.status == "sent" || receipt.status == "failed" {
            try await outbox.remove(origin: client.endpoint.absoluteString, sessionId: outboxId)
            if receipt.status == "sent", draft == pending.text { draft = "" }
            if receipt.status == "failed" { draft = pending.text; errorKey = "qq.delivery.failed" }
            self.pending = nil
        } else { errorKey = "qq.delivery.unknown" }
    }
    private func handle(_ error: Error) {
        guard !Task.isCancelled else { return }
        errorKey = (error as? CompanionError)?.localizationKey ?? "error.unavailable"
    }
}
