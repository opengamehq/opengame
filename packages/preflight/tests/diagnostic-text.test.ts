import test from "node:test";
import assert from "node:assert/strict";
import { redactDiagnostic, redactFinding } from "../src/diagnostic-text";
import { platformPreflight } from "../src/platform";

const secret = "AKIA" + "Z".repeat(16);
test("diagnostics remove plain, Unicode-adjacent and NUL-interleaved key spans", () => {
  for (const value of [secret, "ÿ" + secret, [...secret].join("\0")]) {
    const result = redactDiagnostic(`https://outside.example/import/${value}/file.js`);
    assert.ok(!result.includes(secret));
    assert.ok(!result.replace(/\0/g, "").includes(secret));
    assert.match(result, /credential removed/);
    assert.match(result, /outside\.example/);
  }
  const finding = redactFinding({ title: secret, detail: `SUPABASE_SERVICE_ROLE_KEY="synthetic-opaque-value"`, path: secret + ".js", more: [secret, secret] });
  assert.ok(!JSON.stringify(finding).includes(secret));
  assert.ok(!JSON.stringify(finding).includes("synthetic-opaque-value"));
});

test("a recoverable wide key fails source inspection without entering import findings", async () => {
  const source = `import "./${secret}.js"; const wide = "${[...secret].join("\0")}";`;
  const result = await platformPreflight([
    { path: "index.html", size: 42, text: async () => '<script type="module" src="game.js"></script>' },
    { path: "game.js", size: source.length, text: async () => source },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.checks.secrets, "failed");
  assert.ok(result.findings.some(finding => finding.code === "credential-in-file"));
  assert.ok(!JSON.stringify(result.findings).replace(/\\u0000/g, "").includes(secret));
});

test("a credential-shaped filename is refused and omitted from diagnostic strings", async () => {
  const result = await platformPreflight([
    { path: "index.html", size: 12, text: async () => "<title>x</title>" },
    { path: `${secret}.dat`, size: 0, text: async () => "" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.checks.secrets, "failed");
  assert.ok(!JSON.stringify(result.findings).includes(secret));
});
