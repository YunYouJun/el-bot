// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "YunBotCore",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [.library(name: "YunBotCore", targets: ["YunBotCore"])],
    targets: [
        .target(name: "YunBotCore"),
        .testTarget(name: "YunBotCoreTests", dependencies: ["YunBotCore"]),
    ]
)
