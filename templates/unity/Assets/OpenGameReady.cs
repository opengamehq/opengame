using OpenGame;
using UnityEngine;

// Calls the com.opengame.sdk package, whose OpenGame.jslib is the only one in the build.
// This starter used to ship a second jslib defining OG_Ready as well, and two definitions
// of one symbol in a Web build either fail to link or let one silently win.
public class OpenGameReady : MonoBehaviour {
    private async void Start() {
        // Ready waits for init to settle, and for a frame to draw.
        try {
            await OG.Init();
        } catch (OpenGameException error) {
            // OG.Init throws on a failed init. The game still marks itself playable, so a
            // player is not left behind the host page's loading screen; services that need
            // the session answer with their own errors.
            Debug.LogWarning($"OpenGame init failed ({error.Code}): {error.Message}");
        }
        await Awaitable.EndOfFrameAsync();
        OG.Ready();
    }
}
