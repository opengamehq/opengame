import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* Every function compiled from a string while this package loads and parses. Installed
   before the package is imported, which is why the imports below are dynamic: a static
   import is evaluated before any line of this file runs. Zod reads the global `Function`
   at the moment it probes, so replacing the global is enough to see the probe. Each test
   file runs in its own process, so no other file's Zod has already probed. */
const compiled: string[] = [];
const NativeFunction = Function;
globalThis.Function = new Proxy(NativeFunction, {
  construct(target, args) {
    compiled.push(new Error("compiled from a string").stack ?? "");
    return Reflect.construct(target, args);
  },
  apply(target, self, args) {
    compiled.push(new Error("compiled from a string").stack ?? "");
    return Reflect.apply(target, self, args);
  },
});

const source = fileURLToPath(new URL("../src/", import.meta.url));

/* The site's CSP has no 'unsafe-eval', so a browser reports every one of these as a
   script-src violation even when the caller catches the throw. On 29 Oct 2026 Zod's
   capability probe did that on every game page. See src/zod.ts. */
test("loading and parsing with this package compiles nothing from a string", async () => {
  for (const file of readdirSync(source).filter(name => name.endsWith(".ts"))) await import(new URL(file, new URL("../src/", import.meta.url)).href);
  const { parseManifest } = await import("../src/manifest");
  const manifest = parseManifest({ title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard", "mouse"] });
  assert.equal(manifest.title, "Night shift");
  globalThis.Function = NativeFunction;
  assert.deepEqual(compiled, [], "a schema in this package compiled a function from a string");
});

test("every file takes z from src/zod.ts, where jitless is set", () => {
  for (const file of readdirSync(source).filter(name => name.endsWith(".ts") && name !== "zod.ts")) {
    const text = readFileSync(source + file, "utf8");
    assert.ok(!/from\s+["']zod(?:\/[^"']*)?["']/.test(text), `${file} imports Zod directly, so its schemas can be built before jitless is set`);
  }
});
