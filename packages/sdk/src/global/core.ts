/** The legacy core script can also be loaded after the complete injected SDK.
 * Add its exports without replacing the existing bridge. */
import { og, OpenGameClient, trustedParent } from '../index.js';
const scope = globalThis as unknown as { OpenGame?: Record<string, unknown> };
scope.OpenGame = Object.assign(scope.OpenGame ?? {}, { og, OpenGameClient, trustedParent });
