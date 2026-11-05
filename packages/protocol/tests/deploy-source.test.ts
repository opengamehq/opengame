import { test } from "node:test";
import assert from "node:assert/strict";
import { deploySourceSchema, manifestOwnerIs } from "../src/index.ts";

/* opengame.json's `owner` against an account's handle: one rule for the server's proof
   of ownership and the GitHub tab. Handles are citext, so
   case is decoration on one account; a different name is never the same one. */
test("an owner line names a handle without its case, with or without the @", () => {
  assert.equal(manifestOwnerIs("@KaladinOG", "kaladinog"), true);
  assert.equal(manifestOwnerIs("kaladinog", "KaladinOG"), true);
  assert.equal(manifestOwnerIs(" @rishi ", "rishi"), true);
  assert.equal(manifestOwnerIs("@rishi2", "rishi"), false);
  assert.equal(manifestOwnerIs("@ris", "rishi"), false);
  assert.equal(manifestOwnerIs("@rishi", null), false, "an account with no handle is named by nobody");
  assert.equal(manifestOwnerIs("@", ""), false);
});

test("a deploy source's ref is a name git could list, never a path out of refs/heads or refs/tags", () => {
  const base = { kind: "github", owner: "acme", repo: "orbit", refKind: "branch", commit: "a".repeat(40), folder: "dist" } as const;
  for (const ref of ["main", "feature/menu", "v1.0.0", "release-2026"]) assert.ok(deploySourceSchema.safeParse({ ...base, ref }).success, ref);
  for (const ref of ["../pull/1/head", "a..b", "/main", "main/", "a//b", ".hidden", "x.lock", "a@{0}", "@", "tab\tname", "bell\u0007"]) {
    assert.equal(deploySourceSchema.safeParse({ ...base, ref }).success, false, JSON.stringify(ref));
  }
});
