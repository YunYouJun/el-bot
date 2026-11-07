import Foundation
import Observation
import YunCore

@MainActor @Observable final class MobilePersonaStore {
    private(set) var response: PersonaResponse?
    private(set) var preview: PersonaPreview?
    private(set) var busy = false
    private(set) var errorKey: String?
    private(set) var noticeKey: String?
    @ObservationIgnored private let api: MobileAPI
    @ObservationIgnored private let onUnauthorized: (Error) -> Void

    init(api: MobileAPI, onUnauthorized: @escaping (Error) -> Void) {
        self.api = api
        self.onUnauthorized = onUnauthorized
    }

    func clearFeedback() {
        errorKey = nil
        noticeKey = nil
    }

    @discardableResult func perform(_ request: PersonaRequest) async -> Bool {
        guard !busy else { return false }
        busy = true
        errorKey = nil
        noticeKey = nil
        defer { busy = false }
        do {
            let result = try await api.personas(request)
            try Task.checkCancellation()
            response = result
            if let value = result.preview { preview = value }
            if request.operation == .use || request.operation == .disable { noticeKey = "persona.saved" }
            if request.operation == .import || request.operation == .update { noticeKey = "persona.imported" }
            return true
        } catch {
            guard !Task.isCancelled else { return false }
            report(error, fallback: "error.unavailable")
            if error as? CompanionError == .unauthorized { onUnauthorized(error) }
            return false
        }
    }

    func report(_ error: Error, fallback: String = "persona.error.file") {
        noticeKey = nil
        if case let CompanionError.rejected(code) = error {
            switch code {
            case "personas_not_configured", "not_found": errorKey = "persona.error.unavailable"
            case "persona_too_large", "request_too_large": errorKey = "persona.error.size"
            case "invalid_persona_file": errorKey = "persona.error.file"
            case "invalid_persona_request": errorKey = "persona.error.input"
            case "persona_operation_failed": errorKey = "persona.error.operation"
            default: errorKey = "error.rejected"
            }
        } else {
            errorKey = (error as? CompanionError)?.localizationKey ?? fallback
        }
    }
}
