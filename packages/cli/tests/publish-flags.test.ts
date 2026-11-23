import { test } from "node:test";
import assert from "node:assert/strict";
import { publishAnswers } from "../src/publish";

/* `opengame publish` and `deploy --publish` read their flags into what the server takes
   (lib/platform/one-flow.ts, ownerAnswersSchema). Review of the mirror, 16 Nov 2026. */

test("a sponsor email keeps everything after the first equals sign", () => {
  const answers = publishAnswers({ track: "rpg", models: "claude,fal", sponsor: "fal", "sponsor-email": "fal=player=studio@example.com" });
  assert.deepEqual(answers.jam, { track: "rpg", models: ["claude", "fal"], sponsors: ["fal"], sponsorEmails: { fal: "player=studio@example.com" } });
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
