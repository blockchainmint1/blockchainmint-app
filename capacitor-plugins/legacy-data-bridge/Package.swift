// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LegacyDataBridge",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "LegacyDataBridge",
            targets: ["LegacyDataBridge"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "LegacyDataBridge",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/LegacyDataBridge"),
        .testTarget(
            name: "LegacyDataBridgeTests",
            dependencies: ["LegacyDataBridge"],
            path: "ios/Tests/LegacyDataBridgeTests")
    ]
)
