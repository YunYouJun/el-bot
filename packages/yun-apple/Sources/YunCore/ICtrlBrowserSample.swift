import Foundation
import Vision

/// A fixed acceptance target, independent of default-browser and foreground lookup.
enum ICtrlBrowserSample {
    static let bundleID = "com.google.chrome.ios"
    static let url = "googlechromes://example.com"

    static func imageData(_ screenshot: DeviceToolJSON, deviceInfo: DeviceToolJSON) throws -> Data {
        let system = deviceInfo["system"]
        guard system["screen_locked"].bool == false else { throw ICtrlError.execution }
        if let foreground = system["foreground_app"].string, foreground != bundleID { throw ICtrlError.execution }
        guard screenshot["scope"].string == "app", screenshot["scoped_to"].string == bundleID,
              let base64 = screenshot["data"].string, let data = Data(base64Encoded: base64),
              !data.isEmpty, data.count <= 512 * 1024 else { throw ICtrlError.invalidResponse }
        return data
    }

    static func containsPageBody(_ text: String) -> Bool {
        text.localizedCaseInsensitiveContains("Example Domain") && text.localizedCaseInsensitiveContains("documentation")
    }

    static func recognize(_ image: Data) throws -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["en-US"]
        try VNImageRequestHandler(data: image).perform([request])
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
}
