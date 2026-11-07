import AppKit
import Darwin
import SwiftUI
import UniformTypeIdentifiers
import YunCore

@MainActor final class DesktopIntegration {
    static let trayIcon: NSImage = {
        let image = Bundle.main.resourceURL.flatMap { NSImage(contentsOf: $0.appendingPathComponent("tray-icon.png")) }
            ?? NSImage(systemSymbolName: "cloud.fill", accessibilityDescription: nil)!
        image.isTemplate = true
        image.size = NSSize(width: 18, height: 18)
        return image
    }()

    static func icon(for program: ClientProgram) -> NSImage {
        let path = program.path.isEmpty
            ? NSWorkspace.shared.urlForApplication(withBundleIdentifier: program.bundleIdentifier)?.path
            : program.path
        return path.map { NSWorkspace.shared.icon(forFile: $0) }
            ?? NSImage(systemSymbolName: "app.dashed", accessibilityDescription: nil)!
    }

    static func installed(_ program: ClientProgram) -> Bool {
        if !program.path.isEmpty { return FileManager.default.fileExists(atPath: program.path) }
        return NSWorkspace.shared.urlForApplication(withBundleIdentifier: program.bundleIdentifier) != nil
    }

    static func choose(_ field: String, store: DesktopStore) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        if field.hasSuffix("AppPath") { panel.allowedContentTypes = [.applicationBundle] }
        panel.prompt = store.text("choose")
        panel.begin { result in
            guard result == .OK, let url = panel.url else { return }
            store.edit(field, value: url.path)
        }
    }
}

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    private var lockDescriptor: Int32 = -1
    var stopController: (() -> Void)?
    var reopenWindow: (() -> Void)?

    func applicationWillFinishLaunching(_ notification: Notification) {
        let settings = DesktopStore.settingsArgument
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".el-bot/client.json").path
        let directory = URL(fileURLWithPath: settings).deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let lockPath = URL(fileURLWithPath: settings).deletingPathExtension().appendingPathExtension("window.lock").path
        lockDescriptor = open(lockPath, O_CREAT | O_RDWR, 0o600)
        if lockDescriptor < 0 || flock(lockDescriptor, LOCK_EX | LOCK_NB) != 0 {
            for identifier in [YunAppIdentity.bundleIdentifier, YunAppIdentity.legacyBundleIdentifier] {
                NSRunningApplication.runningApplications(withBundleIdentifier: identifier)
                    .first { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }?
                    .activate(options: [.activateAllWindows])
            }
            NSApp.terminate(nil)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) { NSApp.activate(ignoringOtherApps: true) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if let reopenWindow { reopenWindow(); return false }
        return true
    }
    func applicationWillTerminate(_ notification: Notification) {
        stopController?()
        if lockDescriptor >= 0 { close(lockDescriptor) }
    }
}
