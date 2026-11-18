// A saved login whose account went away, from repair.test.ts (repair-harness.ts says why).
import test from "node:test";
import assert from "node:assert/strict";
import { token, harness, json } from "./repair-harness";

// preview-serving made a removed tester a 403 not_member, and repair-loop's stale-login
// check only replaced a login on a 401, so the saved login blocked every new one.
test("a saved login for an account removed from the platform is replaced, not a dead end", async () => {
  const deviceCode = "d".repeat(43);
  let removed = false;
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
    if (req.url === "/api/v1/auth/token") return json(res, 200, { access_token: token });
    if (req.url === "/api/v1/auth/me") return removed
      ? json(res, 403, { error: "not_member", message: "This account does not have internal platform access." })
      : json(res, 200, { handle: "rishi", ogNumber: 7, avatar: { seed: 1, palette: "ember" }, credential: { origin: "device" } });
  });
  delete h.env.OPENGAME_TOKEN;
  try {
    assert.equal((await h.cli("login", "--no-wait")).code, 3);
    assert.equal((await h.cli("login", "--continue")).code, 0);
    removed = true;
    const again = await h.cli("login", "--no-wait");
    assert.equal(again.code, 3, JSON.stringify(again.events));
    assert.ok(again.events.some(event => event.type === "notice" && event.code === "stale_login"));
    assert.deepEqual([again.events.at(-1).code, again.events.at(-1).next], ["login_pending", "opengame login --continue"]);
    assert.equal(h.seen.filter(request => request.url === "/api/v1/auth/device").length, 2);
  } finally { await h.close(); }
});

// A suspended or deleted account used to reach the CLI as whatever the server guessed;
// it now has its own code, and a saved login for one is as stale as a removed tester's.
// So is one the moderators banned (account_banned), which since 20261029180000 is a
// non-member and so is refused even a read.
for (const [error, message, said] of [
  ["account_inactive", "This account is suspended or deleted, so it cannot use the platform.", /suspended or deleted/],
  ["account_banned", "OpenGame's moderators have banned this account.", /moderators have banned/],
  // /api/v1/auth/me asks the launch switch before membership, so not_launched arrives
  // here instead of not_member. login is allowed before launch; the saved account is not.
  ["not_launched", "OpenGame opens for creators on 18 November.", /not let in yet/],
] as const) test(`a saved login for an account refused as ${error} is replaced, and says why`, async () => {
  const deviceCode = "d".repeat(43);
  let closed = false;
  const h = await harness((req, res) => {
    if (req.url === "/api/v1/auth/device") return json(res, 200, { device_code: deviceCode, user_code: "BCDF-GHJK", verification_uri: `${h.origin}/cli`, expires_in: 600, interval: 5 });
    if (req.url === "/api/v1/auth/token") return json(res, 200, { access_token: token });
    if (req.url === "/api/v1/auth/me") return closed
      ? json(res, 403, { error, message })
      : json(res, 200, { handle: "rishi", ogNumber: 7, avatar: { seed: 1, palette: "ember" }, credential: { origin: "device" } });
  });
  delete h.env.OPENGAME_TOKEN;
  try {
    assert.equal((await h.cli("login", "--no-wait")).code, 3);
    assert.equal((await h.cli("login", "--continue")).code, 0);
    closed = true;
    const again = await h.cli("login", "--no-wait");
    assert.equal(again.code, 3, JSON.stringify(again.events));
    assert.equal(again.events.at(-1).code, "login_pending");
    const notice = again.events.find(event => event.type === "notice" && event.code === "stale_login");
    assert.match(notice?.message ?? "", said);
    assert.equal(h.seen.filter(request => request.url === "/api/v1/auth/device").length, 2);
  } finally { await h.close(); }
});
