"""Unit fakes intentionally expose only the verified Ren'Py facade APIs."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


class SessionTests(unittest.TestCase):
    def session(self):
        states = {"music": True, "sound": False, "voice": False}
        music = types.SimpleNamespace(get_pause=lambda channel: states[channel],
                                      set_pause=lambda value, channel: states.__setitem__(channel, value))
        exports = types.ModuleType("renpy.exports")
        exports.music = music
        exports.restart_interaction = lambda: None
        package = types.ModuleType("renpy")
        package.__path__ = []
        package.exports = exports
        class Preferences:
            def __init__(self):
                self.volumes = {"music": 0.4, "sfx": 0.8, "voice": 0.0, "main": 1.0}
                self.mute = {"music": False, "sfx": True, "voice": False, "main": False}
            def get_all_mixers(self):
                return ["music", "sfx", "voice"]
            def get_mute(self, mixer):
                return self.mute[mixer]
            def set_mute(self, mixer, value):
                self.mute[mixer] = value
                if not value and self.volumes[mixer] == 0:
                    self.volumes[mixer] = 1.0
        package.game = types.SimpleNamespace(preferences=Preferences())
        sdk = types.SimpleNamespace(available=lambda: False)
        spec = importlib.util.spec_from_file_location("session_test", Path(__file__).parents[1] / "game/opengame_session.py")
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"renpy": package, "renpy.exports": exports, "opengame": sdk}):
            spec.loader.exec_module(module)
        module.test_preferences = package.game.preferences
        return module, states

    def test_initial_cleanup_uses_exports_facade(self):
        session, states = self.session()
        session.start()
        self.assertEqual(states, {"music": True, "sound": False, "voice": False})
        session.tick()

    def test_mute_survives_new_play_and_restores_mixer_state(self):
        session, states = self.session()
        preferences = session.test_preferences
        original_volumes = dict(preferences.volumes)
        original_mutes = dict(preferences.mute)
        session._mute(True)
        self.assertTrue(all(preferences.mute.values()))
        # Ren'Py play/queue clear channel pause; mixer mute still blocks audio.
        states["music"] = False
        self.assertTrue(preferences.mute["music"])
        session._mute(False)
        self.assertEqual(preferences.volumes, original_volumes)
        self.assertEqual(preferences.mute, original_mutes)
        session._mute(True)
        session.close()
        self.assertEqual(preferences.volumes, original_volumes)
        self.assertEqual(preferences.mute, original_mutes)

    def test_host_pause_restores_preexisting_channel_pause(self):
        session, states = self.session()
        session.paused = True
        session._apply_audio()
        self.assertTrue(all(states.values()))
        session.paused = False
        session._apply_audio()
        self.assertEqual(states, {"music": True, "sound": False, "voice": False})


if __name__ == "__main__":
    unittest.main()
