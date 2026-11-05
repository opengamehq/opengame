import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { bootstrapSchema, type Bootstrap } from "@opengame/protocol";
import { LIMITS } from "@opengame/shared";

/** Upload and repair cases need valid startup data before reaching their own seam.
 * These cases do not test account meters. The empty usage record avoids adding
 * allowance notices to assertions about upload or repair output. The site sends its
 * platform limits in `platform`, and the CLI reads none of them (it carries its own from
 * the build), so the record is empty: sending LIMITS.platform whole made this file a read
 * of every platform limit, and the public mirror exports what its tests read. */
export function startupInformation(overrides: Partial<Bootstrap> = {}): Bootstrap {
  return bootstrapSchema.parse({ apiVersion: LIMITS.platform.apiVersion,
    minimumCliVersion: LIMITS.platform.minimumCliVersion, packagingContract: LIMITS.platform.packagingContract,
    bundle: LIMITS.bundle, platform: {}, usage: {}, package: null,
    capabilities: { incrementalUpload: false }, ...overrides });
}

export function replyBootstrap(request: IncomingMessage, response: ServerResponse, token: string, overrides: Partial<Bootstrap> = {}): boolean {
  if (request.url !== "/api/v1/bootstrap") return false;
  assert.equal(request.method, "GET");
  assert.equal(request.headers.authorization, `Bearer ${token}`);
  assert.equal(request.headers["idempotency-key"], undefined);
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(startupInformation(overrides)));
  return true;
}
