#if arch(wasm32)
import JavaScriptKit
import OpenGame

// JavaScript owns DOM rendering; Swift owns the game and the native SDK client.
final class TargetGame {
    private let host = JSObject.global.SwiftTargetHost.object!
    private var client: Bridge?
    private var callbacks: [JSClosure] = []
    private var initialization = 0
    private var initialized = false
    private var announced = false
    private var drawn = false
    private var paused = false
    private var stopped = false
    private var score = 0
    private var elapsed = 0.0
    private var previous = 0.0
    private var x = 320.0
    private var y = 240.0

    func start() {
        do {
            client = try Bridge { [weak self] message in self?.receive(message) }
            initialization = try client!.request("init")
        } catch {
            _ = host.status!("OpenGame unavailable. Open this build with opengame dev or on OpenGame.")
        }
        let frame = JSClosure { [weak self] args in
            self?.frame(args[0].number ?? 0)
            return .undefined
        }
        let hit = JSClosure { [weak self] args in
            self?.hit(args[0].number, args[1].number)
            return .undefined
        }
        let close = JSClosure { [weak self] _ in
            self?.stop()
            return .undefined
        }
        callbacks = [frame, hit, close]
        _ = host.connect!(frame, hit, close)
    }

    private func receive(_ message: BridgeMessage) {
        if message.kind == "event" && message.name == "pause" {
            // Bridge state events carry the boolean itself, not an object.
            if let value = JSObject.global.JSON.object!.parse!(message.json).boolean {
                paused = value
                previous = 0
            }
        } else if message.kind == "event" && message.name == "mute" {
            if let value = JSObject.global.JSON.object!.parse!(message.json).boolean {
                _ = host.mute!(value)
            }
        } else if message.kind == "result" && message.id == initialization {
            let result = JSObject.global.JSON.object!.parse!(message.json).object
            initialized = result?.ok.boolean == true
            _ = host.status!(initialized ? "Click the square, or press Space, to score." : "OpenGame initialization failed.")
        } else if message.kind == "result" && message.name == "board.submit" {
            let result = JSObject.global.JSON.object!.parse!(message.json).object
            _ = host.status!(result?.ok.boolean == true ? "Score submitted. Keep playing!" : "Score was not submitted. Keep playing!")
        }
    }

    private func frame(_ now: Double) {
        guard !stopped else { return }
        if !paused {
            if previous > 0 { elapsed += min((now - previous) / 1000, 0.05) }
            x = 320 + 240 * (elapsed * 0.9).sinValue
            y = 225 + 135 * (elapsed * 1.3).cosValue
        }
        previous = now
        _ = host.draw!(x, y, score, paused)
        // This callback runs on animation frames. Waiting until the next frame
        // after the first draw gives the browser a playable frame before ready.
        if initialized && drawn && !announced {
            announced = true
            try? client?.ready()
        }
        drawn = true
    }

    private func hit(_ px: Double?, _ py: Double?) {
        guard !stopped && !paused else { return }
        if let px = px, let py = py, (abs(px - x) > 28 || abs(py - y) > 28) { return }
        score += 1
        elapsed += 1.7
        _ = host.beep!()
        if score % 5 == 0 && initialized {
            _ = try? client?.request("board.submit", argsJSON: "{\"key\":\"targets\",\"score\":\(score)}")
        }
    }

    func stop() {
        guard !stopped else { return }
        stopped = true
        _ = host.disconnect!()
        client?.close()
        client = nil
        for callback in callbacks { callback.release() }
        callbacks = []
    }
}

// Math goes through the browser so this sample needs no Foundation wasm shim.
extension Double {
    var sinValue: Double { JSObject.global.Math.object!.sin!(self).number! }
    var cosValue: Double { JSObject.global.Math.object!.cos!(self).number! }
}

let game = TargetGame()
game.start()
#else
#error("Build SwiftTarget with a Swift WebAssembly SDK and PackageToJS, not a host-native executable.")
#endif
