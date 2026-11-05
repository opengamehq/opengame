import test from "node:test";
import assert from "node:assert/strict";
import { parseTokenHandoff, tokenManagementPath } from "../src/token-management";
test("token handoffs round-trip explicit permissions without accepting a credential or mutating by URL", () => {
  const request = parseTokenHandoff({ action: "create", name: "Laptop", scopes: "read,submit", game: "littleorbit" });
  assert.deepEqual(request, { action: "create", name: "Laptop", scopes: ["read", "submit"], game: "littleorbit" });
  assert.equal(tokenManagementPath(request!), "/settings/tokens?action=create&name=Laptop&scopes=read%2Csubmit&game=littleorbit");
  assert.deepEqual(parseTokenHandoff({}), { action: "list" });
  assert.deepEqual(parseTokenHandoff({ action: "create" }), { action: "create", scopes: ["deploy"] });
  for (const value of [{ action: ["create", "revoke"] }, { action: "create", scopes: "admin" },
    { action: "create", scopes: "read,read" }, { action: "revoke", id: "abc" }, { action: "create", game: "littleorbit\n" },
    { action: "create", name: "ogt_" + "a".repeat(16) + "_" + "b".repeat(43) }]) assert.equal(parseTokenHandoff(value), null);
});
