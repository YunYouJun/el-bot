import SwiftUI
import YunUI

struct PersonasView: View {
    let store: DesktopStore
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            if store.state.personaLoaded {
                PersonaSummary(name: store.state.personaName, detail: store.state.personaDescription,
                               personaID: store.state.personaSelection.split(separator: ":").first.map(String.init))
                Picker(store.text("currentPersona"), selection: Binding(get: { store.state.personaSelection }, set: { store.send("persona", $0) })) {
                    ForEach(store.state.personaChoices) { Text($0.name).tag($0.value) }
                }.disabled(store.disabled)
            } else {
                ContentUnavailableView(store.text("personas"), systemImage: "person.crop.rectangle", description: Text(store.text("noPersonas")))
            }
            HStack {
                Button(store.text("refreshPersona")) { store.send("refreshPersonas") }
                Button(store.text("managePersonas")) { store.send("managePersonas") }
            }.disabled(store.disabled || store.state.host.isEmpty)
            Text(store.text("personaHint")).font(.callout).foregroundStyle(.secondary)
        }
    }
}
