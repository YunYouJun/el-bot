import Foundation
import Observation
import SwiftUI
import UIKit
import UserNotifications
import YunCore

@MainActor @Observable final class ReminderNotifications {
    static let shared = ReminderNotifications()
    private(set) var status: ReminderNotificationStatus?
    private(set) var permission: UNAuthorizationStatus = .notDetermined
    private(set) var busy = false
    private(set) var registering = false
    private(set) var wantsNotifications = false
    private(set) var errorKey: String?
    var openedSession: String?
    private var client: MobileAPI?
    private var token: Data?
    private var uploadedToken: Data?
    private var generation = 0
    private var pendingOpen: (session: String, origin: String)?

    var isEnabled: Bool { wantsNotifications && permission != .denied }
    private var preferenceKey: String? { client.map { "yun.notifications.enabled.\($0.endpoint.absoluteString)" } }

    private func savePreference(_ value: Bool) {
        wantsNotifications = value
        if let preferenceKey { UserDefaults.standard.set(value, forKey: preferenceKey) }
    }

    func configure(_ client: MobileAPI?) async {
        let changed = self.client !== client
        guard changed || !busy else { return }
        generation += 1
        let current = generation
        self.client = client
        if changed {
            status = nil
            errorKey = nil
            busy = false
            uploadedToken = nil
            registering = false
            wantsNotifications = preferenceKey.flatMap { UserDefaults.standard.object(forKey: $0) as? Bool } ?? false
        }
        if let pendingOpen, client != nil {
            self.pendingOpen = nil
            open(session: pendingOpen.session, origin: pendingOpen.origin)
        }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard current == generation else { return }
        permission = settings.authorizationStatus
        guard let client else { return }
        do {
            let status = try await client.reminderNotifications()
            guard current == generation else { return }
            self.status = status
            if let preferenceKey, UserDefaults.standard.object(forKey: preferenceKey) == nil, status.registered {
                savePreference(true)
            }
            if isEnabled && (permission == .authorized || permission == .provisional) {
                registering = !status.registered
                UIApplication.shared.registerForRemoteNotifications()
                if let token { await registered(token) }
            } else if status.registered {
                let updated = try await client.unregisterReminderNotifications()
                guard current == generation else { return }
                self.status = updated
            }
        } catch {
            if current == generation && !Task.isCancelled { errorKey = "notifications.error.server" }
        }
    }

    func setEnabled(_ enabled: Bool) async {
        guard !busy, let client, status?.configured == true else { return }
        busy = true
        errorKey = nil
        let current = generation
        let previous = wantsNotifications
        savePreference(enabled)
        defer { if current == generation { busy = false } }
        do {
            if enabled {
                let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
                let settings = await UNUserNotificationCenter.current().notificationSettings()
                guard current == generation else { return }
                permission = settings.authorizationStatus
                guard allowed else { savePreference(false); return }
                registering = true
                UIApplication.shared.registerForRemoteNotifications()
                if let token { await registered(token) }
            } else {
                registering = false
                let updated = try await client.unregisterReminderNotifications()
                guard current == generation else { return }
                uploadedToken = nil
                status = updated
            }
        } catch {
            guard current == generation else { return }
            savePreference(previous)
            errorKey = "notifications.error.server"
        }
    }

    func registered(_ token: Data) async {
        self.token = token
        guard let client, isEnabled else { return }
        if uploadedToken == token && status?.registered == true { registering = false; return }
        let current = generation
        let preferenceKey = preferenceKey
        let environment = Bundle.main.object(forInfoDictionaryKey: "YunAPNSEnvironment") as? String
        guard environment == "development" || environment == "production" else {
            registering = false
            errorKey = "notifications.error.registration"
            return
        }
        do {
            var status = try await client.registerReminderNotifications(token: token, environment: environment == "development" ? "sandbox" : "production")
            // A token upload may finish after the user switched reminders off.
            if let preferenceKey, UserDefaults.standard.object(forKey: preferenceKey) as? Bool == false {
                status = try await client.unregisterReminderNotifications()
            }
            guard current == generation else { return }
            self.status = status
            uploadedToken = status.registered ? token : nil
            registering = false
            errorKey = nil
        } catch {
            if current == generation { registering = false; errorKey = "notifications.error.server" }
        }
    }

    func registrationFailed() { registering = false; errorKey = "notifications.error.registration" }

    func open(session: String, origin: String) {
        guard session.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil,
              let endpoint = try? Endpoint(origin) else { return }
        guard let client else { pendingOpen = (session, endpoint.absoluteString); return }
        guard endpoint.absoluteString == client.endpoint.absoluteString else { return }
        openedSession = session
    }
}

final class ReminderNotificationDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in await ReminderNotifications.shared.registered(deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in ReminderNotifications.shared.registrationFailed() }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let session = response.notification.request.content.userInfo["sessionId"] as? String,
              let origin = response.notification.request.content.userInfo["origin"] as? String else { return }
        await MainActor.run { ReminderNotifications.shared.open(session: session, origin: origin) }
    }
}

struct ReminderNotificationSettings: View {
    @State private var model = ReminderNotifications.shared
    @Environment(\.yunStrings) private var text
    var body: some View {
        Form {
            Section {
                Toggle(text["notifications.enable"], isOn: Binding(
                    get: { model.isEnabled },
                    set: { enabled in Task { await model.setEnabled(enabled) } }
                ))
                .disabled(model.busy || model.status?.configured != true || model.permission == .denied)
                .accessibilityIdentifier("reminderNotificationsToggle")
                if model.permission == .denied {
                    Button(text["notifications.openSettings"]) {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                } else if model.status?.configured == false {
                    Text(text["notifications.notConfigured"]).foregroundStyle(.secondary)
                }
                if let error = model.errorKey {
                    Text(text[error]).font(.footnote).foregroundStyle(.secondary)
                }
            } footer: { Text(text["notifications.detail"]) }
            if let receipt = model.status?.lastReceipt {
                Section {
                    LabeledContent(text["notifications.lastReceipt"], value: text["notifications.receipt.\(receipt.status)"])
                } footer: { Text(text["notifications.receipt.detail"]) }
            }
        }
        .navigationTitle(text["notifications.title"])
        .navigationBarTitleDisplayMode(.inline)
    }
}
