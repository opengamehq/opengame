import { test } from "node:test";
import assert from "node:assert/strict";
import { publishAnswers } from "../src/publish";
import type { Api } from "../src/http";

/* `opengame publish` and `deploy --publish` read their flags into what the server takes
   (lib/platform/one-flow.ts, ownerAnswersSchema). Review of the mirror, 16 Nov 2026. */

test("a sponsor email keeps everything after the first equals sign", () => {
  const answers = publishAnswers({ track: "rpg", models: "claude,fal", sponsor: "fal", "sponsor-email": "fal=player=studio@example.com" });
  assert.deepEqual(answers.jam, { track: "rpg", models: ["claude", "fal"], sponsors: ["fal"], sponsorEmails: { fal: "player=studio@example.com" }, sponsorPosts: {} });
});

test("a genre is a slug; auto is not a value, since leaving the flag out is Auto", () => {
  assert.equal(publishAnswers({ genre: "racing-sports" }).genre, "racing-sports");
  assert.equal(publishAnswers({}).genre, undefined);
  assert.throws(() => publishAnswers({ genre: "auto" }), /Leave it out/);
});

test("the jam's flags and --no-jam are one choice, and a sponsor needs its email", () => {
  assert.equal(publishAnswers({ "no-jam": true }).jam, null);
  assert.throws(() => publishAnswers({ "no-jam": true, track: "rpg" }), /not both/);
  assert.throws(() => publishAnswers({ track: "rpg", sponsor: "fal" }), /email of the account you used at fal/);
});

test("a banner style is directed or classic, and leaving it out keeps the game's own choice", () => {
  assert.equal(publishAnswers({ "banner-style": "classic" }).bannerStyle, "classic");
  assert.equal(publishAnswers({ "banner-style": "directed" }).bannerStyle, "directed");
  assert.equal("bannerStyle" in publishAnswers({}), false);
  for (const bad of ["Classic", "painted", true] as const) {
    assert.throws(() => publishAnswers({ "banner-style": bad }), /--banner-style directed or --banner-style classic/, String(bad));
  }
});

/* Meshy's track asks for a post on X (26 Nov 2026), and its judges watch the link, so only a
   link to one post is sent, in the one shape the server stores. */
test("a sponsor post is a link to one post on X, written the way the server stores it", () => {
  const read = (post: string) => publishAnswers({ track: "rpg", models: "meshy", sponsor: "meshy", "sponsor-email": "meshy=you@example.com", "sponsor-post": post }).jam;
  assert.deepEqual(read("meshy=https://twitter.com/Maker_1/status/1861234567890?s=20")!.sponsorPosts, { meshy: "https://x.com/Maker_1/status/1861234567890" });
  assert.deepEqual(read("meshy=x.com/maker/status/42/video/1, fal=https://mobile.x.com/other/status/7")!.sponsorPosts,
    { meshy: "https://x.com/maker/status/42", fal: "https://x.com/other/status/7" });
  for (const bad of ["meshy=https://x.com/maker", "meshy=https://example.com/maker/status/42", "meshy=https://x.com/search?q=meshy"]) {
    assert.throws(() => read(bad), /is not a link to a post on X/, bad);
  }
  for (const bad of ["https://x.com/maker/status/42", "meshy=", "=https://x.com/maker/status/42"]) {
    assert.throws(() => read(bad), /--sponsor-post sponsor=link/, bad);
  }
  assert.throws(() => publishAnswers({ "no-jam": true, "sponsor-post": "meshy=https://x.com/maker/status/42" }), /--sponsor-post to enter the jam, not both/);
});
