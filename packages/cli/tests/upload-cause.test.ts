import test from "node:test";
import assert from "node:assert/strict";
import { Api, UploadInterrupted, uploadFailureCause } from "../src/http";

/* The failure is injected under undici's real fetch, through the dispatcher the Api uses,
   so each error arrives wrapped the way a real one does: TypeError("fetch failed") with the
   system error as its cause. The shapes were read off real failures with undici 6.29: a
   refused connection to localhost is an AggregateError with one ECONNREFUSED per address. */
const SECRET = "X-Amz-Signature=0123456789abcdef";
const URL_ = `https://storage.example.com/og-quarantine/build.zip?${SECRET}`;
const system = (code: string, message: string) => Object.assign(new Error(message), { code });

async function uploadFailingWith(error: Error): Promise<UploadInterrupted> {
  const api = new Api("https://opengame.io");
  (api as unknown as { dispatcher: unknown }).dispatcher = {
    dispatch(_options: unknown, handler: { onError(error: Error): void }) { setImmediate(() => handler.onError(error)); return true; },
  };
  const bytes = new Uint8Array([1, 2, 3]);
  try {
    await api.upload({ url: URL_, headers: { "content-type": "application/zip", "if-none-match": "*", "content-length": "3" } }, bytes);
  } catch (caught) {
    assert.ok(caught instanceof UploadInterrupted, `expected UploadInterrupted, got ${String(caught)}`);
    return caught;
  }
  assert.fail("the upload did not fail");
}

const CASES: Array<[string, Error, string]> = [
  ["TLS bad record mac (alert)", system("ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC", `SSL routines:ssl3_read_bytes:sslv3 alert bad record mac ${URL_}`), "the secure connection broke"],
  ["TLS bad record mac (local)", system("ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC", "decryption failed or bad record mac"), "the secure connection broke"],
  ["TLS protocol error", system("EPROTO", "write EPROTO"), "the secure connection broke"],
  ["certificate", system("CERT_HAS_EXPIRED", "certificate has expired"), "the secure connection could not be verified"],
  ["DNS", system("ENOTFOUND", "getaddrinfo ENOTFOUND storage.example.com"), "the address could not be found"],
  ["DNS, temporary", system("EAI_AGAIN", "getaddrinfo EAI_AGAIN storage.example.com"), "the address could not be found"],
  ["refused, every address", Object.assign(new AggregateError([system("ECONNREFUSED", "connect ECONNREFUSED ::1:443"), system("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:443")], ""), { code: "ECONNREFUSED" }), "the server refused the connection"],
  ["refused, inside an aggregate without a code", new AggregateError([system("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:443")], ""), "the server refused the connection"],
  ["refused, wrapped by undici's socket error", Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET", cause: system("ECONNREFUSED", "connect ECONNREFUSED") }), "the server refused the connection"],
  ["connect timeout", system("UND_ERR_CONNECT_TIMEOUT", "Connect Timeout Error"), "it timed out"],
  ["reset", system("ECONNRESET", "read ECONNRESET"), "the connection dropped"],
  ["no code at all", new Error("socket hang up"), "the connection dropped"],
];

for (const [name, error, cause] of CASES) {
  test(`an upload that fails on ${name} says ${cause}`, async () => {
    const interrupted = await uploadFailingWith(error);
    assert.equal(interrupted.cause, cause);
    assert.equal(interrupted.message, `The upload did not finish: ${cause}. Run opengame deploy again to resume the same operation.`);
    for (const leak of [SECRET, "storage.example.com", "SSL routines", "127.0.0.1"]) assert.ok(!interrupted.message.includes(leak), `${leak} reached the message`);
  });
}

test("the upload's own deadline is it timed out, and a proxy refusing the tunnel is not", async () => {
  assert.equal(uploadFailureCause(new DOMException("The operation was aborted due to timeout", "TimeoutError")), "it timed out");
  // undici's RequestAbortedError when HTTPS_PROXY answers the CONNECT with 407 or 403.
  const proxy = Object.assign(new Error("Proxy response (407) !== 200 when HTTP Tunneling"), { name: "AbortError", code: "UND_ERR_ABORTED" });
  assert.equal((await uploadFailingWith(proxy)).cause, "the connection dropped");
});
