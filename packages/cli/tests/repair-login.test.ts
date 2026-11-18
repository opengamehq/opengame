// Signing in, from repair.test.ts (repair-harness.ts says why it is several files).
import test from "node:test";
import assert from "node:assert/strict";
import { token, harness, json } from "./repair-harness";

test("login in a folder that is already signed in succeeds without a new code", async () => {
  const deviceCode = "d".repeat(43);
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
    if (req.url === "/api/v1/auth/token") return json(res, 200, { access_token: token });
    if (req.url === "/api/v1/auth/me") return json(res, 200, { handle: "rishi", ogNumber: 7, avatar: { seed: 1, palette: "ember" }, credential: { origin: "device" } });
  });
  delete h.env.OPENGAME_TOKEN;
  try {
    // Pending is exit 3, not yet signed in; --continue finishes it.
    assert.equal((await h.cli("login", "--no-wait")).code, 3);
    assert.equal((await h.cli("login", "--continue")).code, 0);
    const again = await h.cli("login", "--no-wait");
    assert.equal(again.code, 0, JSON.stringify(again.events));
    assert.deepEqual([again.events.at(-1).data.signedIn, again.events.at(-1).data.handle, again.events.at(-1).data.next], [true, "rishi", null]);
    assert.equal(h.seen.filter(request => request.url === "/api/v1/auth/device").length, 1);
    assert.ok(!h.seen.some(request => request.url === "/api/v1/auth/logout"));
  } finally { await h.close(); }
});


// An approval collected after its account stopped being a member is refused with the
// reason; only a bare access_denied is somebody pressing Deny in the browser.
test("a login refused because the approving account closed says so, not that it was denied", async () => {
  const deviceCode = "d".repeat(43);
  /* Each reason has a server and a config folder of its own, so the five run at once: each
     waits out one five-second poll, and one after another they were 27 s of this file. */
  await Promise.all(([["account_inactive", /suspended or deleted/], ["account_banned", /moderators have banned the account that approved/], ["not_member", /no longer has platform access/], ["handle_required", /has no handle\. Claim one on OpenGame/], [null, /denied in the browser/]] as const).map(async ([reason, said]) => {
    const h = await harness((req, res) => {
      if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
      if (req.url === "/api/v1/auth/token") return json(res, 400, { error: "access_denied", ...(reason ? { reason } : {}) });
    });
    delete h.env.OPENGAME_TOKEN;
    try {
      assert.equal((await h.cli("login", "--no-wait")).code, 3);
      const refused = await h.cli("login", "--continue");
      assert.equal(refused.code, 3, JSON.stringify(refused.events));
      const error = refused.events.find(event => event.type === "error");
      assert.equal(error?.code, "access_denied");
      assert.match(error?.message ?? "", said);
    } finally { await h.close(); }
  }));
});

test("logout never revokes a token the environment supplies unless asked", async () => {
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/logout") return json(res, 200, { revoked: true });
  });
  try {
    const refused = await h.cli("logout");
    assert.equal(refused.code, 2);
    assert.equal(refused.events.at(-1).code, "environment_token");
    assert.ok(!h.seen.some(request => request.url === "/api/v1/auth/logout"));
    const login = await h.cli("login");
    assert.match(login.events.at(-1).message, /Unset OPENGAME_TOKEN/);
    assert.doesNotMatch(login.events.at(-1).message, /logout/);
    const revoked = await h.cli("logout", "--revoke");
    assert.equal(revoked.code, 0);
    assert.ok(h.seen.some(request => request.url === "/api/v1/auth/logout"));
  } finally { await h.close(); }
});

test("an agent can start a login, show the code, and finish it with a second command", async () => {
  let approved = false;
  const deviceCode = "d".repeat(43);
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
    if (req.url === "/api/v1/auth/token") return approved ? json(res, 200, { access_token: token }) : json(res, 400, { error: "authorization_pending" });
    if (req.url === "/api/v1/auth/me") return json(res, 200, { handle: "rishi", ogNumber: 7, avatar: { seed: 1, palette: "ember" }, credential: { origin: "device" } });
  });
  delete h.env.OPENGAME_TOKEN;
  try {
    const started = await h.cli("login", "--no-wait");
    // Not signed in yet: exit 3, so a script's `login && deploy` stops here.
    assert.equal(started.code, 3);
    assert.deepEqual([started.events[0].type, started.events[0].userCode, started.events[0].url], ["notice", "BCDF-GHJK", `${h.origin}/cli?code=BCDF-GHJK`]);
    assert.deepEqual([started.events.at(-1).code, started.events.at(-1).next], ["login_pending", "opengame login --continue"]);
    // A second start reuses the waiting code rather than minting another.
    await h.cli("login", "--no-wait");
    assert.equal(h.seen.filter(request => request.url === "/api/v1/auth/device").length, 1);
    approved = true;
    const finished = await h.cli("login", "--continue");
    assert.equal(finished.code, 0, JSON.stringify(finished.events));
    assert.equal(finished.events.at(-1).data.handle, "rishi");
    const again = await h.cli("login", "--continue");
    assert.equal(again.events.at(-1).code, "no_pending_login");
  } finally { await h.close(); }
});
