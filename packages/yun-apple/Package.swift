// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "YunApple",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "YunCore", targets: ["YunCore"]),
        .library(name: "YunUI", targets: ["YunUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/gonzalezreal/swift-markdown-ui", exact: "2.4.1"),
    ],
    targets: [
        .target(name: "YunCore", resources: [.process("Resources")]),
        .target(name: "YunUI", dependencies: [
            "YunCore",
            .product(name: "MarkdownUI", package: "swift-markdown-ui"),
        ], resources: [.process("Resources")]),
        .testTarget(name: "YunCoreTests", dependencies: ["YunCore"]),
        .testTarget(name: "YunUITests", dependencies: ["YunUI"]),
    ]
)
