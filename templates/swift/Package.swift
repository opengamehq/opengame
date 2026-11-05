// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SwiftTarget",
    products: [.executable(name: "SwiftTarget", targets: ["SwiftTarget"])],
    dependencies: [
        .package(path: "opengame-sdk"),
        .package(url: "https://github.com/swiftwasm/JavaScriptKit.git", from: "0.30.0"),
    ],
    targets: [
        .executableTarget(name: "SwiftTarget", dependencies: [
            .product(name: "OpenGame", package: "opengame-sdk"),
            .product(name: "JavaScriptKit", package: "JavaScriptKit"),
        ]),
    ]
)
