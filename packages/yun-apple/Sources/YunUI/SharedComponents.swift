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
    let personaID: String?
    public init(name: String, detail: String, personaID: String? = nil) {
        self.name = name; self.detail = detail; self.personaID = personaID
    }
    public var body: some View {
        HStack(alignment: .top, spacing: 16) {
            PersonaAvatar(personaID: personaID, size: 64)
            VStack(alignment: .leading, spacing: 12) {
                Text(name).font(.title2)
                Text(detail).foregroundStyle(.secondary).textSelection(.enabled)
            }
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
