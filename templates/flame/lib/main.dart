import 'dart:convert';
import 'dart:ui';
import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/widgets.dart';
import 'package:opengame/opengame.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(GameWidget(game: TargetGame()));
}

class TargetGame extends FlameGame with TapCallbacks {
  int points = 0;
  Rect target = const Rect.fromLTWH(80, 180, 70, 70);
  Bridge? _bridge;
  int? _initializationId;
  bool _initialized = false;
  bool _hostPaused = false;
  bool _readyQueued = false;
  bool _hasPlayableFrame = false;
  bool _closed = false;
  String _status = 'Connecting to OpenGame…';

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    if (_closed) return;
    try {
      _bridge = Bridge(_onMessage);
      _initializationId = _bridge!.request('init');
    } catch (_) {
      _status = 'Open this game with opengame dev or on an OpenGame host.';
      _bridge?.close();
      _bridge = null;
    }
  }

  void _onMessage(BridgeMessage message) {
    if (_closed) return;
    if (message.kind == 'event' && message.id == 0 && message.name == 'pause') {
      final state = jsonDecode(message.json);
      if (state is bool) {
        _hostPaused = state;
        _applyPause();
      }
    } else if (message.kind == 'result' &&
        message.id == _initializationId && message.name == 'init') {
      final result = jsonDecode(message.json);
      _initialized = result is Map && result['ok'] == true;
      _status = _initialized
          ? 'Select the square to score.'
          : 'OpenGame initialization failed.';
      if (!_initialized) {
        _bridge?.close();
        _bridge = null;
      }
    }
  }

  void _applyPause() {
    // State replay can arrive inside Bridge's constructor, before the first
    // render. Let that frame finish before stopping Flame's render loop.
    if (!_hasPlayableFrame) return;
    if (_hostPaused) {
      pauseEngine();
    } else {
      resumeEngine();
    }
  }

  @override
  Color backgroundColor() => const Color(0xff17191c);

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    canvas.drawRect(target, Paint()..color = const Color(0xfff0be55));
    final text = TextPainter(
      text: TextSpan(
        text: 'Points: $points\n$_status',
        style: const TextStyle(color: Color(0xfff5f5f3), fontSize: 24),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: size.x);
    text.paint(canvas, const Offset(20, 20));
    text.dispose();
    if (_initialized && !_readyQueued) {
      _readyQueued = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_closed) return;
        _hasPlayableFrame = true;
        _bridge?.ready();
        _applyPause();
      });
    }
  }

  @override
  void onTapDown(TapDownEvent event) {
    if (!_initialized || _hostPaused || _closed) return;
    if (target.contains(event.localPosition.toOffset())) {
      points++;
      final width = size.x > 140 ? size.x - 140 : 1;
      target = Rect.fromLTWH(40 + (points * 97) % width, 180, 70, 70);
    }
  }

  @override
  void onRemove() {
    _closed = true;
    _bridge?.close();
    _bridge = null;
    super.onRemove();
  }
}
