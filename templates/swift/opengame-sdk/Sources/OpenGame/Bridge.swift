#if arch(wasm32)
import JavaScriptKit
#endif

public enum BridgeError: Error {
    case unavailable
    case alreadyAttached
    case closed
}

public struct BridgeMessage {
    public let kind: String
    public let id: Int
    public let name: String
    public let json: String
}

/// Browser main-thread owner of the global bridge callback.
public final class Bridge {
    private static var attached = false
    private var closed = false
    #if arch(wasm32)
    private let bridge: JSObject
    private var callback: JSClosure?
    #endif

    public init(handler: @escaping (BridgeMessage) -> Void) throws {
        #if arch(wasm32)
        guard JSObject.global.window.object != nil,
              let connect = JSObject.global.OpenGameNativeConnect.function else { throw BridgeError.unavailable }
        guard !Self.attached else { throw BridgeError.alreadyAttached }
        let nativeCallback = JSClosure { arguments in
            handler(BridgeMessage(kind: arguments[0].string!, id: Int(arguments[1].number!),
                                 name: arguments[2].string!, json: arguments[3].string!))
            return .undefined
        }
        bridge = connect(nativeCallback).object!
        callback = nativeCallback
        Self.attached = true
        #else
        throw BridgeError.unavailable
        #endif
    }

    private func check() throws {
        if closed { throw BridgeError.closed }
        #if !arch(wasm32)
        throw BridgeError.unavailable
        #endif
    }
    public func request(_ operation: String, argsJSON: String = "{}") throws -> Int {
        try check()
        #if arch(wasm32)
        return Int(bridge.request!(operation, argsJSON).number!)
        #else
        throw BridgeError.unavailable
        #endif
    }
    public func environmentJSON() throws -> String {
        try check()
        #if arch(wasm32)
        return bridge.env!().string!
        #else
        throw BridgeError.unavailable
        #endif
    }
    public func playerJSON() throws -> String {
        try check()
        #if arch(wasm32)
        return bridge.player!().string!
        #else
        throw BridgeError.unavailable
        #endif
    }
    public func ready() throws {
        try check()
        #if arch(wasm32)
        _ = bridge.ready!()
        #endif
    }
    public func close() {
        if closed { return }
        #if arch(wasm32)
        _ = bridge.close!()
        callback?.release()
        callback = nil
        #endif
        closed = true
        Self.attached = false
    }
    deinit { close() }
}
