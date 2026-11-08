import SwiftUI
import YunCore
import YunUI

struct PersonasView: View {
    let chat: ChatStore

    var body: some View {
        NavigationStack {
            PersonaLibraryScreen(chat: chat)
        }
    }
}
