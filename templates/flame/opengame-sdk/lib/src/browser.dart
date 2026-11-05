import 'dart:js_interop';
import 'message.dart';

@JS('OpenGameNativeConnect')
external _Bridge _connect(JSFunction handler);
@JS('OpenGameNativeConnect')
external JSFunction? get _connectFunction;
extension type _Bridge(JSObject _) implements JSObject {
  external void close();
  external int request(String op, String json);
  external String env();
  external String player();
  external void ready();
}

class Bridge {
  static bool _attached = false;
  late final _Bridge _bridge;
  bool _closed = false;
  late final JSFunction _callback;

  Bridge(void Function(BridgeMessage) handler) {
    if (_connectFunction == null) throw UnsupportedError(
        'OpenGame unavailable: load /_og/sdk.js and web/lifecycle.js first.');
    if (_attached) throw StateError('OpenGame already has a Dart owner.');
    _callback = ((JSString kind, JSNumber id, JSString name, JSString json) {
      handler(BridgeMessage(kind.toDart, id.toDartInt, name.toDart, json.toDart));
    }).toJS;
    _bridge = _connect(_callback);
    _attached = true;
  }
  void _check() { if (_closed) throw StateError('OpenGame bridge is closed.'); }
  int request(String operation, [String argsJson = '{}']) { _check(); return _bridge.request(operation, argsJson); }
  String environmentJson() { _check(); return _bridge.env(); }
  String playerJson() { _check(); return _bridge.player(); }
  void ready() { _check(); _bridge.ready(); }
  void close() {
    if (_closed) return;
    _bridge.close();
    _closed = true;
    _attached = false;
  }
}
