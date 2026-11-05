"""Browser session state lives outside Ren'Py's rollback and save store."""
import json
import renpy.exports as renpy
import renpy as renpy_runtime
import opengame

client = None
initialization = None
initialized = False
paused = False
muted = False
score = 0
status = "Desktop preview: OpenGame services are available in the web export."
_painted = False
_ready = False
_audio_pauses = {}
_mixer_states = {}


def start():
    global client, initialization, score, status
    close()
    score = 0
    if opengame.available():
        client = opengame.Bridge()
        initialization = client.request("init")
        status = "Connecting to OpenGame..."


def ensure_started():
    if client is None:
        start()


def _apply_audio():
    for channel in ("music", "sound", "voice"):
        if paused:
            if channel not in _audio_pauses:
                _audio_pauses[channel] = renpy.music.get_pause(channel=channel)
            renpy.music.set_pause(True, channel=channel)
        elif channel in _audio_pauses:
            renpy.music.set_pause(_audio_pauses.pop(channel), channel=channel)

    # The 8.3.7 audio loop consults mixer mute for every new cue. music.play()
    # clears channel pause, so a one-time channel pause cannot implement mute.
    preferences = renpy_runtime.game.preferences
    if muted:
        for mixer in set(preferences.get_all_mixers()) | {"main"}:
            if mixer not in _mixer_states:
                _mixer_states[mixer] = (preferences.get_mute(mixer), preferences.volumes.get(mixer, 1.0))
            preferences.set_mute(mixer, True)
    else:
        for mixer, (was_muted, volume) in list(_mixer_states.items()):
            preferences.set_mute(mixer, was_muted)
            # set_mute may raise a zero volume to 1.0 on unmute. Restore the raw
            # level as well, including the level hidden by an existing mute.
            preferences.volumes[mixer] = volume
        _mixer_states.clear()


def _mute(value):
    global muted
    muted = value
    _apply_audio()


def tick():
    global initialized, paused, status, _painted, _ready
    if client is not None:
        for message in client.poll():
            value = json.loads(message["json"])
            if message["kind"] == "event":
                # These snapshots are JSON booleans, not {"paused": ...}.
                if message["name"] == "pause" and isinstance(value, bool):
                    paused = value
                    _apply_audio()
                elif message["name"] == "mute" and isinstance(value, bool):
                    _mute(value)
            elif message["id"] == initialization:
                initialized = value.get("ok") is True
                status = "OpenGame connected." if initialized else "OpenGame initialization failed."
            elif message["name"] == "board.submit":
                status = "Score submitted." if value.get("ok") is True else "Score was not submitted."
        if initialized and _painted and not _ready:
            client.ready()
            _ready = True
    _painted = True
    renpy.restart_interaction()


def hit():
    global score
    if paused:
        return
    score += 1
    if client is not None and initialized:
        client.request("board.submit", json.dumps({"key": "targets", "score": score}))


def close():
    global client, initialization, initialized, paused, status, _painted, _ready
    if client is not None:
        client.close()
        client = None
    paused = False
    _mute(False)
    initialization = None
    initialized = paused = _painted = _ready = False
    status = "Desktop preview: OpenGame services are available in the web export."
