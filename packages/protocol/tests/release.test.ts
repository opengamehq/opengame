import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "@opengame/shared";
import { RECEIPT_CONTRACTS } from "../src/release";
import { hasAuthority, type Principal } from "../src/authority";

test("tokens cannot certify, grant authority or escape a game pin", () => {
  const token: Principal = { kind: "token", userId: "u", tokenId: "t", origin: "automation", scopes: ["deploy"], gameId: "g" };
  assert.equal(hasAuthority(token, "deploy", "g"), true);
  for (const action of ["submit", "read", "certify", "tokens", "account", "preview"] as const) assert.equal(hasAuthority(token, action, "g"), false, action);
  assert.equal(hasAuthority(token, "deploy"), false);
  assert.equal(hasAuthority(token, "deploy", "other"), false);
});


test("only a device-login token with read scope can request its owner's preview", () => {
  const device: Principal = { kind: "token", userId: "u", tokenId: "t", origin: "device", scopes: ["read"], gameId: "g" };
  assert.equal(hasAuthority(device, "preview", "g"), true);
  assert.equal(hasAuthority({ ...device, origin: "automation" }, "preview", "g"), false);
  assert.equal(hasAuthority({ ...device, scopes: [] }, "preview", "g"), false);
  assert.equal(hasAuthority(device, "preview", "other"), false);
  for (const action of ["certify", "tokens", "account"] as const) assert.equal(hasAuthority(device, action, "g"), false);
});


// Shadow mode records text answers and never waits on them. A publish list that
// required a passed text-policy receipt under contract 3 asked for one nothing writes.
test("contract 3 requires no text-policy pass for a preview or a publication", () => {
  const checks = (contract: string, purpose: "preview" | "publish") => RECEIPT_CONTRACTS[contract]![purpose].map(row => row.check);
  assert.ok(!checks("3", "preview").includes("text-policy"));
  assert.ok(!checks("3", "publish").includes("text-policy"));
  assert.ok(checks("3", "publish").includes("images") && checks("3", "publish").includes("playtest"));
  // Earlier contracts are unchanged: a release checked under them keeps its rules.
  assert.ok(checks("2", "preview").includes("text-policy") && checks("2", "publish").includes("text-policy"));
  assert.ok(!checks("1", "publish").includes("text-policy"));
  assert.equal(LIMITS.platform.receiptContract, "3");
});

test("a deploy reports only its contract's preview checks", async () => {
  const { previewChecks } = await import("../src/release");
  assert.deepEqual(previewChecks("2").map(check => check.check).sort(), ["archive", "desktop", "engine", "images", "malware", "preflight", "secrets", "text-policy"]);
  assert.equal(previewChecks("2").some(check => ["boot", "playtest", "agent-playtest"].includes(check.check)), false);
  assert.deepEqual(previewChecks("9"), []);
  assert.deepEqual(previewChecks(null), []);
});

test("the review sentence holds beside a queue position", async () => {
  const { RELEASE_STATUS } = await import("../src/status");
  // It sits beside "3 releases are ahead of yours", which "is checking your game" contradicted.
  assert.doesNotMatch(RELEASE_STATUS.review.message, /is checking/);
});

test("the take-down and withdrawn sentences promise nothing that does not happen", async () => {
  const { RELEASE_STATUS } = await import("../src/status");
  // No mail goes out when we pull a game, so "check your email" sent people to look for
  // one that never came. The address is what they can actually use.
  assert.doesNotMatch(RELEASE_STATUS.pulled.message, /email/i);
  assert.match(RELEASE_STATUS.pulled.message, /team@opengame\.io/);
  // platform_close_publication also ends here, when the game came down before the release
  // went live, and the creator did not withdraw anything.
  assert.doesNotMatch(RELEASE_STATUS.withdrawn.message, /^You withdrew/);
});
