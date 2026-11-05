import * as net from "node:net";
import { LIMITS } from "@opengame/shared";

/**
 * Give each address of a host longer than Node's 250 ms to accept a connection. Past that,
 * Node moves on, and when every address is that slow it fails the request with ETIMEDOUT
 * rather than waiting for any of them; limits.json `platform.http.connectAttemptTimeoutMs`
 * has the measurement. Every fetch this process makes (the API, R2 uploads, vendor's
 * downloads through its own dispatcher) opens its sockets through this default. Never
 * lowered: a person who set a longer one with NODE_OPTIONS keeps it.
 */
export function applyNetworkDefaults(attemptMs = LIMITS.platform.http.connectAttemptTimeoutMs): void {
  // Node 18.17 is supported and predates these optional socket defaults.
  if (typeof net.getDefaultAutoSelectFamilyAttemptTimeout === "function" &&
      typeof net.setDefaultAutoSelectFamilyAttemptTimeout === "function" &&
      net.getDefaultAutoSelectFamilyAttemptTimeout() < attemptMs) {
    net.setDefaultAutoSelectFamilyAttemptTimeout(attemptMs);
  }
}
