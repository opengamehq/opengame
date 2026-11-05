import 'message.dart';

class Bridge {
  Bridge(void Function(BridgeMessage) handler) { _unavailable(); }
  Never _unavailable() => throw UnsupportedError('OpenGame is unavailable outside a browser web export.');
  int request(String operation, [String argsJson = '{}']) => _unavailable();
  String environmentJson() => _unavailable();
  String playerJson() => _unavailable();
  void ready() => _unavailable();
  void close() {}
}
