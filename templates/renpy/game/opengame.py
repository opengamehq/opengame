"""Ren'Py web FFI. Poll from the game interaction loop; never block it waiting for JS."""
import json

try:
    import emscripten
except ImportError:
    emscripten = None


class UnavailableError(RuntimeError):
    pass


def available():
    return bool(emscripten and emscripten.run_script_int(
        "!!(globalThis.OpenGameRenpyHost && globalThis.OpenGameRenpyHost.available())"))


class Bridge:
    def __init__(self):
        if not available():
            raise UnavailableError("OpenGame unavailable: load opengame-global.js, then lifecycle.js and opengame.js, before Ren'Py starts")
        self.closed = False
        self._call("attach")

    def _call(self, method, *args):
        if self.closed:
            raise RuntimeError("OpenGame bridge is closed")
        # Every argument is a JSON literal, including user strings. No executable
        # game text is interpolated into this eval-based host API.
        expression = "JSON.stringify(globalThis.OpenGameRenpyHost[%s](%s) ?? null)" % (
            json.dumps(method), ",".join(json.dumps(arg, allow_nan=False) for arg in args))
        return json.loads(emscripten.run_script_string(expression))

    def request(self, operation, args_json="{}"):
        return self._call("request", operation, args_json)

    def env(self):
        return self._call("env")

    def player(self):
        return self._call("player")

    def ready(self):
        self._call("ready")

    def poll(self):
        """Return the results and events queued since the last poll."""
        return self._call("poll")

    def close(self):
        if not self.closed:
            self._call("close")
            self.closed = True
