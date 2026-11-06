import SwiftUI
import YunCore

public struct ClientMessages: View {
    let error: String
    let note: String
    let pending: Bool
    let pendingLabel: String

    public init(error: String, note: String, pending: Bool, pendingLabel: String) {
        self.error = error
        self.note = note
        self.pending = pending
        self.pendingLabel = pendingLabel
    }

    public var body: some View {
        if !error.isEmpty {
            Label(error, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red).textSelection(.enabled)
        }
        if !note.isEmpty {
            Label(note, systemImage: "checkmark.circle").foregroundStyle(.secondary)
        }
        if pending {
            HStack { ProgressView().controlSize(.small); Text(pendingLabel).foregroundStyle(.secondary) }
        }
    }
}

public struct PersonaSummary: View {
    let name: String
    let detail: String
    public init(name: String, detail: String) { self.name = name; self.detail = detail }
    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(name, systemImage: "person.crop.circle").font(.title2)
            Text(detail).foregroundStyle(.secondary).textSelection(.enabled)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

public struct LanguagePicker: View {
    let title: String
    let systemLabel: String
    @Binding var selection: String
    public init(title: String, systemLabel: String, selection: Binding<String>) {
        self.title = title; self.systemLabel = systemLabel; self._selection = selection
    }
    public var body: some View {
        Picker(title, selection: $selection) {
            Text(systemLabel).tag("")
            Text("简体中文").tag("zh-Hans")
            Text("English").tag("en")
        }
    }
}
