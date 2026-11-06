import AppKit
import SwiftUI

private struct Choice: Decodable, Identifiable {
    let value: String
    let name: String
    var id: String { value }
}
private struct Language: Decodable, Identifiable {
    let tag: String
    let name: String
    var id: String { tag }
}
private struct Program: Decodable, Identifiable {
    let name: String
    let title: String
    let action: String
    let bundleIdentifier: String
    let path: String
    var id: String { name }
}
private struct Preferences: Decodable {
    var messageFormat: String
    var imageTheme: String
}
private struct Snapshot: Decodable {
    let page: String
    let locale: String
    let localePreference: String
    let languages: [Language]
    let strings: [String: String]
    let draft: [String: String]
    let programs: [Program]
    let host: String
    let pending: Bool
    let localExpanded: Bool
    let error: String
    let note: String
    let phase: String
    let qq: String
    let agent: String
    let agentConnection: String
    let task: String
    let phaseKey: String
    let preferences: Preferences
    let preferencesLoaded: Bool
    let logs: String
    let personaLoaded: Bool
    let personaName: String
    let personaDescription: String
    let personaSelection: String
    let personaChoices: [Choice]
}
private struct Action: Encodable {
    let action: String
    let value: String
    let field: String
}
private typealias ActionCallback = @convention(c) (UInt, UnsafePointer<UInt8>?, Int) -> Void

@MainActor private final class Model: ObservableObject {
    @Published var state: Snapshot
    let windowID: UInt
    let callback: ActionCallback
    private var icons: [String: NSImage] = [:]
    init(_ state: Snapshot, windowID: UInt, callback: ActionCallback) {
        self.state = state
        self.windowID = windowID
        self.callback = callback
    }
    func text(_ key: String) -> String { state.strings[key] ?? key }
    func send(_ action: String, _ value: String = "", field: String = "") {
        guard let data = try? JSONEncoder().encode(Action(action: action, value: value, field: field)) else { return }
        data.withUnsafeBytes { bytes in
            callback(windowID, bytes.bindMemory(to: UInt8.self).baseAddress, bytes.count)
        }
    }
    func binding(_ field: String) -> Binding<String> {
        Binding(get: { self.state.draft[field] ?? "" }, set: { self.send("edit", $0, field: field) })
    }
    func appIcon(_ program: Program) -> NSImage {
        let key = program.name + ":" + program.path
        if let cached = icons[key] { return cached }
        let path = program.path.isEmpty ? NSWorkspace.shared.urlForApplication(withBundleIdentifier: program.bundleIdentifier)?.path : program.path
        let icon = path.map { NSWorkspace.shared.icon(forFile: $0) }
            ?? NSImage(systemSymbolName: "app.dashed", accessibilityDescription: nil)!
        icons[key] = icon
        return icon
    }
}

private struct Detail: View {
    @ObservedObject var model: Model
    var body: some View {
        Group {
            if model.state.page == "settings" { settings }
            else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        heading
                        messages
                        if model.state.page == "personas" { personas } else { home }
                    }
                    .padding(28)
                    .frame(maxWidth: 880, alignment: .leading)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    private var heading: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(model.text(model.state.page)).font(.title2.bold())
            Text(model.text(descriptionKey))
                .font(.callout).foregroundStyle(.secondary)
        }
    }
    private var descriptionKey: String {
        switch model.state.page {
        case "personas": "personasDescription"
        case "settings": "settingsDescription"
        default: "homeDescription"
        }
    }
    @ViewBuilder private var messages: some View {
        if !model.state.error.isEmpty {
            Label(model.state.error, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red).font(.callout).textSelection(.enabled)
                .accessibilityLabel(model.state.error)
        }
        if !model.state.note.isEmpty {
            Label(model.state.note, systemImage: "checkmark.circle").foregroundStyle(.secondary).font(.callout)
        }
        if model.state.pending {
            HStack(spacing: 8) { ProgressView().controlSize(.small); Text(model.text("pending")).foregroundStyle(.secondary) }
                .accessibilityLabel(model.text("pending"))
        }
    }
    private var home: some View {
        VStack(alignment: .leading, spacing: 24) {
            GroupBox {
                HStack(alignment: .top, spacing: 18) {
                    Image(systemName: "cloud.fill").font(.system(size: 32)).foregroundStyle(.tint)
                        .frame(width: 52, height: 52).background(.tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 12) {
                        Text(model.text("cloud")).font(.headline)
                        Text(model.text("cloudDescription")).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        if !model.state.host.isEmpty {
                            Label(model.state.host, systemImage: "server.rack").font(.caption.monospaced()).foregroundStyle(.secondary)
                        }
                        HStack(spacing: 10) {
                            Button { model.send("openCloud") } label: { Label(model.text("openCloud"), systemImage: "arrow.up.right.square") }
                                .buttonStyle(.borderedProminent).disabled(model.state.pending || model.state.host.isEmpty)
                            Button(model.text("configureCloud")) { model.send("navigate", "settings") }.buttonStyle(.bordered)
                        }
                    }
                    Spacer(minLength: 0)
                }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
            }
            VStack(alignment: .leading, spacing: 12) {
                Label(model.text("programs"), systemImage: "square.grid.2x2").font(.headline)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 10) {
                    ForEach(model.state.programs) { program in
                        Button { model.send("openProgram", program.name) } label: {
                            VStack(spacing: 9) {
                                Image(nsImage: model.appIcon(program)).resizable().interpolation(.high).frame(width: 38, height: 38).accessibilityHidden(true)
                                Text(program.title).font(.callout)
                            }.frame(maxWidth: .infinity).padding(.vertical, 10)
                        }
                        .buttonStyle(.bordered).disabled(model.state.pending)
                        .help(program.action).accessibilityLabel(program.action)
                    }
                }
            }
            Divider()
            DisclosureGroup(isExpanded: Binding(get: { model.state.localExpanded }, set: { model.send("toggleLocal", String($0)) })) {
                local.padding(.top, 12)
            } label: { Label(model.text("localBot"), systemImage: "desktopcomputer").font(.headline) }
            Text(model.text("quitHint")).font(.caption).foregroundStyle(.tertiary)
        }
    }
    private var local: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label(model.state.phase, systemImage: model.state.phaseKey == "running" ? "circle.fill" : "circle")
                    .foregroundStyle(model.state.phaseKey == "running" ? Color.green : Color.secondary)
                Spacer()
                Button { model.send("refreshStatus") } label: { Label(model.text("refresh"), systemImage: "arrow.clockwise") }
                    .disabled(model.state.pending)
            }
            HStack(spacing: 30) {
                LabeledContent("QQ", value: model.state.qq)
                LabeledContent(model.state.agent, value: model.state.agentConnection)
            }.font(.callout)
            if !model.state.task.isEmpty { Text(model.state.task).font(.caption.monospaced()).textSelection(.enabled) }
            HStack {
                Button(model.text("start")) { model.send("start") }.disabled(model.state.pending || model.state.phaseKey != "stopped")
                Button(model.text("stop")) { model.send("stop") }.disabled(model.state.pending || !["running", "starting"].contains(model.state.phaseKey))
                Button(model.text("restart")) { model.send("restart") }.disabled(model.state.pending || model.state.phaseKey != "running")
            }.buttonStyle(.bordered)
        }
    }
    private var personas: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 16) {
                    Image(systemName: "person.crop.square").font(.system(size: 34)).foregroundStyle(.tint).frame(width: 50, height: 50)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(model.state.personaName).font(.title3.bold())
                        Text(model.state.personaDescription).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
                    }
                }
                if model.state.personaLoaded {
                    Picker(model.text("currentPersona"), selection: Binding(get: { model.state.personaSelection }, set: { model.send("persona", $0) })) {
                        ForEach(model.state.personaChoices) { choice in Text(choice.name).tag(choice.value) }
                    }.pickerStyle(.menu).disabled(model.state.pending)
                }
                Text(model.text("personaHint")).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                HStack {
                    Button { model.send("refreshPersonas") } label: { Label(model.text("refreshPersona"), systemImage: "arrow.clockwise") }
                    Button { model.send("managePersonas") } label: { Label(model.text("managePersonas"), systemImage: "arrow.up.right.square") }
                        .buttonStyle(.borderedProminent)
                }.disabled(model.state.pending || model.state.host.isEmpty)
            }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
    private var settings: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading.padding(.horizontal, 28).padding(.top, 24).padding(.bottom, 12)
            if !model.state.error.isEmpty || !model.state.note.isEmpty || model.state.pending {
                messages.padding(.horizontal, 28).padding(.bottom, 10)
            }
            Form {
                Section {
                    Picker(model.text("language"), selection: Binding(get: { model.state.localePreference }, set: { model.send("locale", $0) })) {
                        ForEach(model.state.languages) { language in Text(language.name).tag(language.tag) }
                    }
                } header: { Label(model.text("language"), systemImage: "globe") }
                Section {
                    TextField(model.text("sshHost"), text: model.binding("sshHost"))
                        .disabled(model.state.pending).autocorrectionDisabled()
                    Text(model.text("cloudHint")).font(.caption).foregroundStyle(.secondary)
                    Button(model.text("saveCloud")) { model.send("saveCloud") }.disabled(model.state.pending)
                } header: { Label(model.text("cloud"), systemImage: "cloud") }
                Section {
                    ForEach(["nodePath", "cliPath", "configPath", "credentialsPath", "statePath", "codexAppPath", "codebuddyAppPath", "dshAppPath", "qqAppPath"], id: \.self) { key in
                        HStack {
                            TextField(model.text(key), text: model.binding(key)).autocorrectionDisabled()
                            Button { model.send("choosePath", field: key) } label: { Image(systemName: "folder") }
                                .help(model.text("choose")).accessibilityLabel(model.text("choose") + " " + model.text(key))
                        }.disabled(model.state.pending)
                    }
                    Text(model.text("savedPathsHint")).font(.caption).foregroundStyle(.secondary)
                    Button(model.text("saveSettings")) { model.send("saveLocal") }.disabled(model.state.pending)
                } header: { Label(model.text("environment"), systemImage: "terminal") }
                Section {
                    Picker(model.text("messageFormat"), selection: Binding(get: { model.state.preferences.messageFormat }, set: { model.send("editPreference", $0, field: "messageFormat") })) {
                        ForEach(["image", "markdown", "text"], id: \.self) { Text(model.text($0)).tag($0) }
                    }
                    Picker(model.text("imageTheme"), selection: Binding(get: { model.state.preferences.imageTheme }, set: { model.send("editPreference", $0, field: "imageTheme") })) {
                        ForEach(["light", "dark"], id: \.self) { Text(model.text($0)).tag($0) }
                    }
                    HStack {
                        Button(model.text("readPreferences")) { model.send("readPreferences") }
                        Button(model.text("savePreferences")) { model.send("savePreferences") }.disabled(!model.state.preferencesLoaded)
                    }
                } header: { Label(model.text("preferences"), systemImage: "bubble.left.and.text.bubble.right") }
                .disabled(model.state.pending)
                Section {
                    Button { model.send("logs") } label: { Label(model.text("refreshLogs"), systemImage: "arrow.clockwise") }.disabled(model.state.pending)
                    Text(model.state.logs.isEmpty ? model.text("noLogs") : model.state.logs).font(.caption.monospaced()).textSelection(.enabled)
                } header: { Label(model.text("logs"), systemImage: "text.alignleft") }
            }
            .formStyle(.grouped)
        }
    }
}

@MainActor private final class NativeHost: NSViewController, NSOutlineViewDataSource, NSOutlineViewDelegate, NSToolbarDelegate {
    let model: Model
    let split = NSSplitViewController()
    let outline = NSOutlineView()
    let titleLabel = NSTextField(labelWithString: "")
    let caption = NSTextField(labelWithString: "")
    let language = NSPopUpButton(frame: .zero, pullsDown: false)
    let pages = ["quickActions", "personas", "settings"]
    weak var window: NSWindow?
    private var cloudItem: NSToolbarItem?
    private var sidebarItem: NSToolbarItem?
    private var languageItem: NSToolbarItem?
    private var lastPage = ""
    private var lastLocale = ""
    init(window: NSWindow, state: Snapshot, callback: ActionCallback) {
        self.model = Model(state, windowID: UInt(bitPattern: Unmanaged.passUnretained(window).toOpaque()), callback: callback)
        self.window = window
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    func install() {
        guard let window, let container = window.contentView else { return }
        // Keep MyGo's container and surface alive; replace only the visible child.
        container.subviews.forEach { $0.isHidden = true }
        view = container
        let sidebar = NSViewController()
        let effect = NSVisualEffectView()
        effect.material = .sidebar
        effect.blendingMode = .behindWindow
        effect.state = .followsWindowActiveState
        sidebar.view = effect
        let brand = NSStackView()
        brand.orientation = .horizontal; brand.spacing = 10
        let icon = NSImageView(image: NSApplication.shared.applicationIconImage)
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 34).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 34).isActive = true
        let titles = NSStackView(views: [titleLabel, caption])
        titles.orientation = .vertical; titles.alignment = .leading; titles.spacing = 3
        titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        caption.font = .systemFont(ofSize: 10); caption.textColor = .secondaryLabelColor
        brand.addArrangedSubview(icon); brand.addArrangedSubview(titles)
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("navigation"))
        outline.addTableColumn(column); outline.outlineTableColumn = column
        outline.headerView = nil; outline.rowHeight = 34; outline.style = .sourceList
        outline.backgroundColor = .clear
        outline.focusRingType = .default; outline.dataSource = self; outline.delegate = self
        outline.setAccessibilityLabel(model.text("appName"))
        let scroll = NSScrollView()
        scroll.documentView = outline; scroll.hasVerticalScroller = true; scroll.drawsBackground = false
        scroll.scrollerStyle = .overlay; scroll.autohidesScrollers = true
        let stack = NSStackView(views: [brand, scroll])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        effect.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: effect.leadingAnchor, constant: 14),
            stack.trailingAnchor.constraint(equalTo: effect.trailingAnchor, constant: -12),
            stack.topAnchor.constraint(equalTo: effect.safeAreaLayoutGuide.topAnchor, constant: 18),
            stack.bottomAnchor.constraint(equalTo: effect.bottomAnchor, constant: -18),
            scroll.widthAnchor.constraint(equalTo: stack.widthAnchor), scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 120)
        ])
        let item = NSSplitViewItem(sidebarWithViewController: sidebar)
        item.minimumThickness = 190; item.maximumThickness = 260; item.preferredThicknessFraction = 0.22
        split.addSplitViewItem(item)
        split.addSplitViewItem(NSSplitViewItem(viewController: NSHostingController(rootView: Detail(model: model))))
        split.splitView.dividerStyle = .thin
        split.splitView.autosaveName = "YunBotSidebar"
        addChild(split)
        split.view.frame = container.bounds
        split.view.autoresizingMask = [.width, .height]
        container.addSubview(split.view)
        window.contentViewController = self
        window.styleMask.insert(.fullSizeContentView)
        window.titlebarAppearsTransparent = true
        window.toolbarStyle = .unified
        let toolbar = NSToolbar(identifier: "YunBotToolbar")
        toolbar.delegate = self; toolbar.displayMode = .iconOnly
        window.toolbar = toolbar
        language.target = self; language.action = #selector(changeLanguage)
        update(model.state)
        window.makeFirstResponder(split.view)
    }
    func update(_ state: Snapshot) {
        model.state = state
        titleLabel.stringValue = model.text("appName")
        caption.stringValue = model.text("caption")
        if lastLocale != state.locale || lastPage != state.page {
            outline.reloadData()
            if let row = pages.firstIndex(of: state.page) { outline.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false) }
            lastLocale = state.locale; lastPage = state.page
        }
        let titles = state.languages.map(\.name)
        let existing = (0..<language.numberOfItems).compactMap { language.item(at: $0)?.title }
        if existing != titles {
            language.removeAllItems()
            language.addItems(withTitles: titles)
        }
        if let index = state.languages.firstIndex(where: { $0.tag == state.localePreference }) {
            language.selectItem(at: index)
        }
        language.setAccessibilityLabel(model.text("language"))
        languageItem?.label = model.text("language")
        outline.setAccessibilityLabel(model.text("appName"))
        sidebarItem?.label = model.text("sidebar")
        sidebarItem?.toolTip = model.text("sidebar")
        cloudItem?.label = model.text("openCloud")
        cloudItem?.toolTip = model.text("openCloud")
        cloudItem?.isEnabled = !state.pending && !state.host.isEmpty
    }
    func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int { item == nil ? pages.count : 0 }
    func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any { pages[index] }
    func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool { false }
    func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
        guard let page = item as? String else { return nil }
        let cell = NSTableCellView()
        let image = NSImageView(image: NSImage(systemSymbolName: ["quickActions": "square.grid.2x2", "personas": "person.crop.rectangle", "settings": "gearshape"][page]!, accessibilityDescription: nil)!)
        let text = NSTextField(labelWithString: model.text(page))
        cell.imageView = image; cell.textField = text
        image.translatesAutoresizingMaskIntoConstraints = false; text.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(image); cell.addSubview(text)
        NSLayoutConstraint.activate([
            image.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 6), image.centerYAnchor.constraint(equalTo: cell.centerYAnchor), image.widthAnchor.constraint(equalToConstant: 18), image.heightAnchor.constraint(equalToConstant: 18),
            text.leadingAnchor.constraint(equalTo: image.trailingAnchor, constant: 9), text.centerYAnchor.constraint(equalTo: cell.centerYAnchor), text.trailingAnchor.constraint(lessThanOrEqualTo: cell.trailingAnchor, constant: -4)
        ])
        return cell
    }
    func outlineViewSelectionDidChange(_ notification: Notification) {
        let row = outline.selectedRow
        guard pages.indices.contains(row), pages[row] != model.state.page else { return }
        model.send("navigate", pages[row])
    }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [.toggleSidebar, .sidebarTrackingSeparator, .flexibleSpace, .init("cloud"), .init("language")] }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { toolbarDefaultItemIdentifiers(toolbar) }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        if identifier == .flexibleSpace { return nil }
        if identifier == .sidebarTrackingSeparator { return NSTrackingSeparatorToolbarItem(identifier: identifier, splitView: split.splitView, dividerIndex: 0) }
        let item = NSToolbarItem(itemIdentifier: identifier)
        if identifier == .toggleSidebar { item.image = NSImage(systemSymbolName: "sidebar.left", accessibilityDescription: nil); item.target = split; item.action = #selector(NSSplitViewController.toggleSidebar(_:)); item.label = model.text("sidebar"); sidebarItem = item }
        if identifier.rawValue == "cloud" { item.image = NSImage(systemSymbolName: "cloud", accessibilityDescription: nil); item.target = self; item.action = #selector(openCloud); item.label = model.text("openCloud"); item.toolTip = item.label; item.isBordered = true; cloudItem = item }
        if identifier.rawValue == "language" { item.view = language; item.label = model.text("language"); languageItem = item }
        return item
    }
    @objc func openCloud() { model.send("openCloud") }
    @objc func changeLanguage() {
        let index = language.indexOfSelectedItem
        guard model.state.languages.indices.contains(index) else { return }
        model.send("locale", model.state.languages[index].tag)
    }
}

@MainActor private var hosts: [UInt: NativeHost] = [:]
@_cdecl("YunBotNativeVersion") public func nativeVersion() -> Int32 { 1 }
private func decode(_ bytes: UnsafePointer<CChar>?, _ length: Int) -> Snapshot? {
    guard let bytes, length > 0, length <= 1_048_576 else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: Data(bytes: bytes, count: length))
}
@_cdecl("YunBotNativeInstall") public func nativeInstall(_ pointer: UnsafeMutableRawPointer?, _ bytes: UnsafePointer<CChar>?, _ length: Int, _ callback: UnsafeRawPointer?) -> Int32 {
    guard Thread.isMainThread, let pointer, let callback, let state = decode(bytes, length) else { return 0 }
    return MainActor.assumeIsolated {
        let window = Unmanaged<NSWindow>.fromOpaque(pointer).takeUnretainedValue()
        let host = NativeHost(window: window, state: state, callback: unsafeBitCast(callback, to: ActionCallback.self))
        hosts[UInt(bitPattern: pointer)] = host
        host.install()
        return 1
    }
}
@_cdecl("YunBotNativeUpdate") public func nativeUpdate(_ pointer: UnsafeMutableRawPointer?, _ bytes: UnsafePointer<CChar>?, _ length: Int) -> Int32 {
    guard Thread.isMainThread, let pointer, let state = decode(bytes, length) else { return 0 }
    return MainActor.assumeIsolated { guard let host = hosts[UInt(bitPattern: pointer)] else { return 0 }; host.update(state); return 1 }
}
@_cdecl("YunBotNativeClose") public func nativeClose(_ pointer: UnsafeMutableRawPointer?) {
    guard let pointer else { return }
    let identifier = UInt(bitPattern: pointer)
    // Release after MyGo finishes its window-close callback and surface teardown.
    guard Thread.isMainThread else { return }
    MainActor.assumeIsolated {
        guard let host = hosts[identifier] else { return }
        DispatchQueue.main.async {
            if hosts[identifier] === host { hosts.removeValue(forKey: identifier) }
        }
    }
}
