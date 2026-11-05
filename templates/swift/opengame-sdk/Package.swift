// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "OpenGame",
    products: [.library(name: "OpenGame", targets: ["OpenGame"])],
    dependencies: [.package(url: "https://github.com/swiftwasm/JavaScriptKit.git", from: "0.30.0")],
    targets: [.target(name: "OpenGame", dependencies: [.product(name: "JavaScriptKit", package: "JavaScriptKit")])]
)
