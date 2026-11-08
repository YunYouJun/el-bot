import Foundation

public enum YunlePointFormatter {
    public static func string(fromMicroPoints amount: Int64) -> String {
        (Decimal(amount) / 1_000).formatted(.number.precision(.fractionLength(0...3)))
    }
}
