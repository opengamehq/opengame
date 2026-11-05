import { spawn } from "node:child_process";
import { agentMode, CliError } from "./output";
import { apiOrigin } from "./http";

/** A server response is not permission to open another application or origin.
 * HTTP is useful only when the configured product itself is on loopback. */
export function trustedBrowserUrl(value: string, origin: string): string {
  try {
    if (/[\u0000-\u0020\u007f\\]/.test(value)) throw new Error();
    const expected = new URL(origin);
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname);
    if (expected.username || expected.password || expected.pathname !== "/" || expected.search || expected.hash ||
      url.username || url.password || url.origin !== expected.origin ||
      (url.protocol !== "https:" && !(local && expected.protocol === "http:" && url.protocol === "http:"))) throw new Error();
    return url.href;
  } catch {
    throw new CliError("invalid_response", "The server returned an unsafe browser link. Check OPENGAME_API_URL and contact the OpenGame team.", 5);
  }
}

/** Arguments, never a shell string: the URL is ours, but a shell would still
 * read `&` in a query as a command separator, which is how Windows `start` breaks. */
export function openBrowser(value: string, enabled: boolean, origin = apiOrigin()): void {
  const url = trustedBrowserUrl(value, origin);
  if (!enabled || agentMode()) return;
  const [command, args] = process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : ["xdg-open", [url]];
  const child = spawn(command as string, args as string[], { stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  child.unref();
}
