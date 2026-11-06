// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "YunMac",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Yun", targets: ["YunMac"])],
    dependencies: [.package(path: "../../packages/yun-apple")],
    targets: [
        .executableTarget(name: "YunMac", dependencies: [
            .product(name: "YunCore", package: "yun-apple"),
            .product(name: "YunUI", package: "yun-apple"),
        ]),
        .testTarget(name: "YunMacTests", dependencies: ["YunMac"]),
    ]
)
