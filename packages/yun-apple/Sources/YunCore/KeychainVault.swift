import Foundation
import OSLog
import Security

struct KeychainVault {
    private let service = "cn.elpsy.yun.chat.connection"

    func load(origin: String) throws -> Data? {
        var query = base(origin)
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw failure(status) }
        return item as? Data
    }

    func save(_ data: Data, origin: String) throws {
        let query = base(origin)
        let attributes: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else {
            throw failure(updated)
        }
        var item = query
        for (key, value) in attributes { item[key] = value }
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw failure(status) }
    }

    func remove(origin: String) {
        SecItemDelete(base(origin) as CFDictionary)
    }

    private func base(_ origin: String) -> [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: origin]
    }

    private func failure(_ status: OSStatus) -> Failure {
        Logger(subsystem: "cn.elpsy.elbot.client", category: "keychain").error("Keychain operation rejected: status \(status)")
        return Failure(status: status)
    }

    struct Failure: Error { let status: OSStatus }
}
