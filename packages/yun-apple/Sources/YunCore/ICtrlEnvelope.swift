import CryptoKit
import Foundation

/// iCTRL v1 wire protocol, evaluated against OpenMinis/iCTRL c1e4268.
/// The protocol uses direction-separated HMAC streams and encrypt-then-MAC.
enum ICtrlEnvelope {
    struct Request {
        let body: DeviceToolJSON
        let nonce: Data
    }

    static func hmac(_ key: Data, _ message: Data) -> Data {
        Data(HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: key)))
    }

    static func token(_ key: Data) -> String { Data(SHA256.hash(data: key)).prefix(4).ictrlHex }

    static func crypt(_ payload: Data, key: Data, nonce: Data) -> Data {
        var output = Data(capacity: payload.count)
        var offset = 0
        var index: UInt32 = 0
        let bytes = [UInt8](payload)
        while offset < bytes.count {
            var counter = index.bigEndian
            let block = hmac(key, nonce + Data(bytes: &counter, count: 4))
            for byte in block where offset < bytes.count {
                output.append(bytes[offset] ^ byte)
                offset += 1
            }
            index += 1
        }
        return output
    }

    static func seal(_ plaintext: Data, key: Data, nonce: Data, timestamp: UInt64) throws -> Request {
        guard key.count == 32, nonce.count == 16 else { throw ICtrlError.invalidResponse }
        let tok = token(key)
        let ciphertext = crypt(plaintext, key: hmac(key, Data("ictrl-v1|enc-req".utf8) + nonce), nonce: nonce)
        var seconds = timestamp.bigEndian
        let message = Data("v1".utf8) + Data(ictrlHex: tok)! + Data(bytes: &seconds, count: 8) + nonce + ciphertext
        let tag = hmac(hmac(key, Data("ictrl-v1|mac".utf8) + nonce), message)
        return Request(body: .object([
            "v": .number(1), "tok": .string(tok), "ts": .number(Double(timestamp)),
            "nonce": .string(nonce.ictrlHex), "ct": .string(ciphertext.base64EncodedString()), "tag": .string(tag.ictrlHex),
        ]), nonce: nonce)
    }

    static func open(_ body: DeviceToolJSON, key: Data, nonce: Data) throws -> Data {
        guard body["v"].number == 1,
              body["nonce"].string == nonce.ictrlHex,
              let encoded = body["ct"].string, let ciphertext = Data(base64Encoded: encoded),
              let hex = body["tag"].string, let tag = Data(ictrlHex: hex), tag.count == 32 else {
            throw ICtrlError.invalidResponse
        }
        let macKey = hmac(key, Data("ictrl-v1|mac".utf8) + nonce)
        guard HMAC<SHA256>.isValidAuthenticationCode(tag, authenticating: Data("resp".utf8) + nonce + ciphertext,
                                                   using: SymmetricKey(data: macKey)) else { throw ICtrlError.invalidResponse }
        return crypt(ciphertext, key: hmac(key, Data("ictrl-v1|enc-resp".utf8) + nonce), nonce: nonce)
    }
}

extension Data {
    init?(ictrlHex: String) {
        guard ictrlHex.count.isMultiple(of: 2), ictrlHex.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else { return nil }
        var bytes: [UInt8] = []
        var position = ictrlHex.startIndex
        while position < ictrlHex.endIndex {
            let end = ictrlHex.index(position, offsetBy: 2)
            guard let byte = UInt8(ictrlHex[position..<end], radix: 16) else { return nil }
            bytes.append(byte)
            position = end
        }
        self.init(bytes)
    }
    var ictrlHex: String { map { String(format: "%02x", $0) }.joined() }
}
