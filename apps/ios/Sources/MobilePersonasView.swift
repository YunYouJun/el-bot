import SwiftUI
import YunCore
import YunUI

struct MobilePersonasView: View {
    let chat: ChatStore

    var body: some View {
        PersonaLibraryScreen(chat: chat)
    }
}
