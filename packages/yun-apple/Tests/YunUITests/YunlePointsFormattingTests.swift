import Testing
@testable import YunUI

@Test func yunlePointsUsesThousandthsAndTrimsTrailingZeros() {
    #expect(yunlePoints(0) == "0")
    #expect(yunlePoints(54) == "0.054")
    #expect(yunlePoints(300_000) == "300")
}
