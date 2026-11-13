/* The minimal checks (limits.json platform.deploy.minimalChecks, 12 Nov 2026): a key in a
 * file, a credential-shaped file name and a `.env` no longer stop a deploy or
 * `opengame check`. A credential a creator ships is theirs to rotate, and the
 * refusal was the commonest way a working game failed to deploy. Each assertion here fails
 * with the detector switched back on (credential-checks-on.ts does that for the files that
 * test the detector itself). */
import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "@opengame/shared";
import { platformPreflight } from "../src/platform";

const key = "AKIA" + "Z".repeat(16);
const files = [
  { path: "index.html", size: 60, text: async () => '<canvas></canvas><script src="game.js"></script>' },
  { path: "game.js", size: 40, text: async () => `const aws = "${key}"; console.log(aws);` },
  { path: ".env", size: 20, text: async () => `SECRET=${key}` },
  { path: "config/service-account.json", size: 20, text: async () => '{"private_key":"x"}' },
];

test("the switch is on in limits.json", () => {
  assert.equal((LIMITS.platform.deploy as { minimalChecks?: boolean }).minimalChecks, true);
});

test("a key in a file and a credential-shaped name do not stop the preflight", async () => {
  const result = await platformPreflight(files);
  const codes = result.findings.map(finding => finding.code);
  for (const code of ["credential", "credential-in-file", "encoded-credential", "possible-secret"]) assert.ok(!codes.includes(code), code);
  assert.notEqual(result.checks.secrets, "failed");
  assert.equal(result.checks.preflight, "passed");
});
