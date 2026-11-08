import Testing
@testable import YunCore

@Test func yunlePointFormatterUsesThousandthsAndTrimsTrailingZeros() {
    #expect(YunlePointFormatter.string(fromMicroPoints: 0) == "0")
    #expect(YunlePointFormatter.string(fromMicroPoints: 54) == "0.054")
    #expect(YunlePointFormatter.string(fromMicroPoints: 300_000) == "300")
}
