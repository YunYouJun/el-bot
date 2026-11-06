// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "YunApple",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "YunCore", targets: ["YunCore"]),
        .library(name: "YunUI", targets: ["YunUI"]),
    ],
    targets: [
        .target(name: "YunCore", resources: [.process("Resources")]),
        .target(name: "YunUI", dependencies: ["YunCore"], resources: [.process("Resources")]),
        .testTarget(name: "YunCoreTests", dependencies: ["YunCore"]),
    ]
)
