import test from "node:test";
import assert from "node:assert/strict";
import { Api } from "../src/http";
import { readBootstrap } from "../src/bootstrap";
import { fakeApi, reply, token } from "./shell";

test("bootstrap gives an authenticated command its startup data in one request", async () => {
  const server = await fakeApi((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    reply(res, 200, { apiVersion: 1, minimumCliVersion: "0.1.0", packagingContract: 1, bundle: { archiveBytesMax: 1000, fileCountMax: 100 }, package: "@opengamehq/cli@0.1.0" });
  });
  const api = new Api(server.origin);
  try {
    assert.equal((await readBootstrap(api, token, "limits")).package, "@opengamehq/cli@0.1.0");
    assert.deepEqual(server.seen.map(req => req.url), ["/api/v1/bootstrap"]);
  } finally { await api.close(); await server.close(); }
});

test("only an absent bootstrap route permits the legacy compatibility read", async () => {
  for (const status of [404, 401, 403, 429, 503]) {
    const server = await fakeApi((req, res) => reply(res, req.url === "/api/v1/bootstrap" ? status : 200,
      req.url === "/api/v1/bootstrap" ? { error: "not_found" } : { bundle: {} }));
    const api = new Api(server.origin);
    try {
      if (status === 404) {
        await readBootstrap(api, token, "limits");
        assert.deepEqual(server.seen.map(req => req.url), ["/api/v1/bootstrap", "/api/v1/limits"]);
      } else {
        await assert.rejects(readBootstrap(api, token, "limits"));
        assert.deepEqual(server.seen.map(req => req.url), ["/api/v1/bootstrap"]);
      }
    } finally { await api.close(); await server.close(); }
  }
});


test("a disabled incremental-upload service preserves its explicit do-not-retry advice", async () => {
  const server = await fakeApi((_req, res) => reply(res, 503, { error: "temporarily_unavailable", message: "File uploads are unavailable. Upload a ZIP archive instead.", retry: "never" }));
  const api = new Api(server.origin);
  try {
    await assert.rejects(api.json("/api/v1/deploys/files", { token }), (error: unknown) => {
      const failure = error as { exitCode: number; retry?: string; message: string };
      assert.equal(failure.exitCode, 5);
      assert.equal(failure.retry, "never");
      assert.match(failure.message, /ZIP archive/);
      return true;
    });
  } finally { await api.close(); await server.close(); }
});
