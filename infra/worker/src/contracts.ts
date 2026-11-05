import limits from "../../../packages/shared/limits.json";
import { derivedContract, servedContractVersion } from "../../../packages/shared/src/runtime-contracts";

/**
 * The headers, and where they come from.
 *
 * A jam entry is frozen at submission close, judged for weeks, and then sits on the
 * marketplace indefinitely. Meanwhile we will want to tighten the policy. If the Worker
 * emitted a constant, every tightening would silently break games nobody is maintaining
 * any more -- years later, for reasons nobody left can explain. So each published version
 * pins a `runtime_contracts.version` and the Worker emits *that* contract's headers.
 *
 * The obvious failure mode of pinning is that a frozen contract also freezes a
 * vulnerability. Hence the split the plan calls for: the contract is a compatibility
 * promise, and the SECURITY_FLOOR below is a global, always-current set of directives that
 * is merged over whatever the contract said. An old entry keeps the world it was built
 * for right up until that world becomes dangerous, at which point one edit here protects
 * every game at once.
 */

export interface RuntimeContract {
  version: string;
  csp: string;
  permissionsPolicy: string;
  crossOriginEmbedderPolicy?: "require-corp";
  documentIsolationPolicy?: "isolate-and-require-corp";
}

/**
 * `connect-src`, assembled from limits.json rather than written out.
 *
 * This is the whole no-external-calls rule, and it is the same list the sandbox runner
 * enforces during review -- which is only true if both read the same file. Adding a fourth
 * allowed origin should be one edit in packages/shared, not two edits that drift.
 */
function connectSrc(): string {
  const origins = limits.allowedGameOrigins as Record<string, unknown>;
  const sources: string[] = [];
  if (origins.self === true) sources.push("'self'");

  /* blob: and data:, and this is the finding that cost the most to see.
   *
   * GLTFLoader does not decode an embedded base64 buffer in memory — it `fetch`es the
   * data: URI. `fetch` is governed by connect-src, and connect-src is *set*, so it does
   * not inherit the `data:` that default-src grants. A .glb with its buffers embedded —
   * which is what "export as a single file" produces in every tool creators actually use
   * — therefore loaded its JSON and then silently failed to load its geometry.
   *
   * The sandbox runner caught it by playing a real game: Der Koloss lost both zombie
   * models, on a policy that reported no violations anybody was looking for.
   *
   * Neither keyword weakens the egress boundary this policy exists to draw. A data: URI
   * is self-contained and a blob: URL is minted by the page from bytes it already has;
   * neither can reach a network the origin list does not already allow. */
  sources.push("blob:", "data:");
  for (const [key, value] of Object.entries(origins)) {
    if (key === "self" || key.startsWith("_")) continue;
    if (typeof value === "string" && value !== "") sources.push(value);
  }
  return `connect-src ${sources.join(" ")}`;
}

/** Who may frame a game. Anyone else gets nothing, including a game framing another game. */
const FRAME_ANCESTORS = "frame-ancestors https://opengame.io https://admin.opengame.io";

/**
 * Global, current, and merged over every contract.
 *
 * `form-action 'none'` is the one worth calling out: a bundle that renders a convincing
 * sign-in form now has nowhere to POST it. Combined with the embed-only gate in index.ts,
 * that is most of the phishing surface gone.
 */
const SECURITY_FLOOR: Record<string, string> = {
  "object-src": "object-src 'none'",
  "base-uri": "base-uri 'none'",
  "form-action": "form-action 'none'",
  "frame-ancestors": FRAME_ANCESTORS,
};

/**
 * The contract every version published in the 2026 jam ships under. New contracts are
 * added beside it; this one is never edited again, because games depend on it verbatim.
 */
function contract2026_10(): RuntimeContract {
  const csp = [
    // blob: and data: are here because engines build worker scripts and textures at
    // runtime out of both. Withholding them breaks Three.js loaders, not attackers.
    "default-src 'self' blob: data:",
    // 'unsafe-inline' is not a concession, it is the reality of shipped engine output;
    // 'wasm-unsafe-eval' is what lets a wasm module compile without opening eval().
    //
    // 'unsafe-eval' is deliberately NOT here, though the original seed row carried it.
    // It is the one keyword in this list that meaningfully widens what a bundle can do,
    // and the evidence says nothing needs it: two full Three.js games — Der Koloss and
    // Modern Claudefare — played for three minutes each on the sandbox runner under this
    // policy without it, with zero script-src violations reported.
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
    // Explicit rather than inherited from default-src, and this one was a live bug.
    // A directive that is *set* does not fall back, so with connect-src named and
    // style-src absent, style-src resolved to default-src — which has no
    // 'unsafe-inline'. Every inline <style> and every style="" attribute in a shipped
    // bundle was blocked, and both ported Originals carry one.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    connectSrc(),
    // A game frames nothing. Stricter than the default-src fallback, which would have
    // let a bundle frame its own origin and any data: URL it liked.
    "frame-src 'none'",
    FRAME_ANCESTORS,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  return {
    version: "2026-10",
    csp,
    // Deny is the default posture; the three exceptions each pay for themselves.
    // microphone stays open because voice chat rides PeerJS media connections, gamepad
    // because the platform advertises controller support, fullscreen because a game is
    // unplayable without it. `(self)` inside a cross-origin frame means the frame's own
    // origin -- the game's subdomain -- not ours.
    permissionsPolicy:
      "camera=(), geolocation=(), payment=(), usb=(), microphone=(self), gamepad=(self), fullscreen=(self)",
  };
}

/**
 * 2026-11: the same policy, plus the trusted stylesheet and font hosts.
 *
 * A NEW VERSION RATHER THAN AN EDIT, which is the rule `contract2026_10` states above
 * itself and the previous migration states again: "once an entry depends on it, a change
 * is a new contract version beside this one, never an edit to this one." The migration
 * that edited 2026-10 was allowed to because the row had never matched what the Worker
 * actually sent -- correcting a record is not a policy change. This is one: the Worker
 * genuinely did not send these hosts before, and Der Koloss and Modern Claudefare were
 * reviewed without them. Widening the policy under them would not break either game, and
 * would still put a header in the evidence trail that was not the one they passed under.
 *
 * WHY WIDEN AT ALL. A jam entry that pulls a webfont is not doing anything wrong, and
 * refusing it teaches a creator the checker is wrong rather than that their game is:
 * Skyhopper was turned away for Google Fonts on 25 Aug 2026, correctly, because the CSP
 * really would have blocked it. Allowing it in the policy is what makes the preflight's
 * new tolerance honest -- relaxing the warning alone would move the failure from a
 * sentence at upload to a black screen at runtime, which is the worse half of the trade.
 *
 * STYLESHEETS AND FONTS ONLY. A script from a CDN is arbitrary code inside the origin
 * that serves untrusted games, with the frame's full access; a stylesheet and a font are
 * passive. The contract's answer for scripts is unchanged: vendor it into the bundle.
 * `trustedGameAssetOrigins` in limits.json holds the list, so this file, `csp.py` and the
 * creator-facing preflight cannot disagree about it.
 */
function contract2026_11(): RuntimeContract {
  const base = contract2026_10();
  const style = limitsTrusted("style");
  const font = limitsTrusted("font");

  const csp = base.csp
    .replace("style-src 'self' 'unsafe-inline'", `style-src 'self' 'unsafe-inline' ${style}`)
    .replace("font-src 'self' data:", `font-src 'self' data: ${font}`);

  return { ...base, version: "2026-11", csp };
}

/** Engine exports opt into this policy only after the embedding isolation gate.
 * Keeping it separate is essential: an unknown version must never widen an old
 * game's script policy, and an existing review must keep the headers it measured. */
function contract2027_01(): RuntimeContract {
  const base = contract2026_11();
  return {
    ...base,
    version: "2027-01",
    csp: base.csp.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"),
    permissionsPolicy: `${base.permissionsPolicy}, cross-origin-isolated=(self)`,
    crossOriginEmbedderPolicy: "require-corp",
    documentIsolationPolicy: "isolate-and-require-corp",
  };
}

/**
 * 2027-02: 2026-11 plus cross-origin isolation. Its headers are 2026-11's plus COEP,
 * Document-Isolation-Policy and the isolation permission, and nothing else; the CSP is
 * 2026-11's exactly. Beyond the headers it gets one more thing, which needs no header:
 * og-games adds the platform SDK tag to its documents (platform-sdk.ts, sdkInjection
 * "edge"), because it cannot carry one in a derived tree.
 *
 * Every engine export that needs more than 2026-11 needs exactly this: threaded Unity 6,
 * threaded Godot 3 and 4, and Kaigen, whose OG Clash build makes shared wasm memory in all
 * three of its bundles. None of them needs `'unsafe-eval'` to boot -- measured on 23 Oct
 * 2026 against four public Unity 6 builds, Godot 4.3 and 4.4 exports, Godot's source and
 * the staged OG Clash site (engine/logs/contract-capabilities.md in the run's outputs). The
 * eval that does exist is behind a game's own call (`JavaScriptBridge.eval`) or Godot's
 * GDExtension linker, and granting it to every threaded game in order to serve those would
 * be granting it to every threaded game that does not.
 *
 * Nor does it carry 2027-01's derived serving tree: that is a server-side rewrite, not a
 * browser power, and nothing about threads asks for it.
 *
 * Isolation is selected by the database from the release's finalized scan, never by a
 * request or a manifest (supabase/migrations/20261023100200). It is safe to hand to a game
 * that merely claims threads in its text: COEP and Document-Isolation-Policy make the game's
 * document stricter about what it may embed, and the high-resolution timers isolation
 * restores measure a process that holds only the game's own origin. The CSP `sandbox` that
 * security.ts adds to every HTML response still applies, and a sandboxed document with
 * allow-same-origin was measured to become isolated under it (same notes). */
function contract2027_02(): RuntimeContract {
  const base = contract2026_11();
  return {
    ...base,
    version: "2027-02",
    permissionsPolicy: `${base.permissionsPolicy}, cross-origin-isolated=(self)`,
    crossOriginEmbedderPolicy: "require-corp",
    documentIsolationPolicy: "isolate-and-require-corp",
  };
}

/**
 * 2027-03: the open network. A game may reach any https: or wss: host, load scripts,
 * stylesheets, fonts, images and media from any https: host, and call eval.
 *
 * WHY. A product decision, 26 Oct 2026: the games we most want more of -- Astral War with its
 * own lobby directory, Smash Royale with its GameLift fleet, anything that talks to an AI
 * model -- were each a special case in this repository (an owner-only `connectSrc` on the
 * host record, a relay route in og-api), and a creator who built the same thing had no way
 * in at all. Whether a game may make an API call is not what keeps players safe. What
 * keeps them safe is the separate registrable domain, one origin per game, no ambient
 * cookies, the frame sandbox, and the short list of things a game may still not do, which
 * lives in limits.json `gamePolicy` and is refused by the checks rather than by this
 * header, because a CSP can only list what to allow.
 *
 * WHY EVAL COMES WITH IT. `2026-10`'s comment calls 'unsafe-eval' "the one keyword that
 * meaningfully widens what a bundle can do", and that was true while script-src named
 * only the game's own origin. Under `https:` it is not: a game can run any code it can
 * host somewhere, and eval adds nothing to that except the Ren'Py and GDExtension builds
 * the keyword was refusing.
 *
 * WHAT STAYS SHUT, and each is deliberate:
 * - `frame-src 'none'`. A third-party frame is how a checkout page, a wallet modal or a
 *   hosted sign-in form gets inside a game, and none of those belong there.
 * - `form-action 'none'`, `object-src 'none'`, `base-uri 'none'`: the floor, unchanged.
 * - plain `http:` and `ws:`. A secure page could not load them anyway, and naming the
 *   secure schemes only keeps the policy saying what the browser will actually do.
 * - `worker-src 'self' blob:`. Browsers do not start a worker from another origin.
 * - Permissions-Policy keeps `payment=()` and adds the browser's own sign-in prompts:
 *   passkeys, FedCM and SMS one-time codes. A game that wants to know who is playing asks
 *   the SDK, which already knows.
 *
 * WHAT THIS GIVES UP, said plainly so nobody reads the review as a bound it is not. Under
 * 2026-11 everything a game could run was in the bundle we scanned, sandboxed and played,
 * and a published version was immutable in behaviour as well as bytes. Under 2027-03 a game
 * can fetch code from its own server after approval, so what a reviewer saw is evidence
 * about the game and not a ceiling on it. The controls for that are the ones that act
 * after publication: reports, takedown, the terms a creator agreed to, and re-review.
 *
 * NOT AN EDIT TO 2026-11, which every published game was reviewed under and which stays
 * byte-for-byte what it was. A release reaches 2027-03 by being frozen after the migration
 * that makes it the default (supabase/migrations/20261027170300).
 */
function contract2027_03(): RuntimeContract {
  const base = contract2026_11();
  const open = base.csp
    .replace("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:", "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https:")
    .replace(/style-src 'self' 'unsafe-inline'[^;]*/, "style-src 'self' 'unsafe-inline' https:")
    .replace("img-src 'self' data: blob:", "img-src 'self' data: blob: https:")
    .replace("media-src 'self' data: blob:", "media-src 'self' data: blob: https:")
    .replace(/font-src 'self' data:[^;]*/, "font-src 'self' data: https:")
    .replace(/connect-src [^;]*/, `${connectSrc()} https: wss:`);
  return {
    ...base,
    version: "2027-03",
    csp: open,
    permissionsPolicy: `${base.permissionsPolicy}, ${SIGN_IN_PROMPTS_DENIED}`,
  };
}

/** The browser's own sign-in prompts, refused inside a game frame on the open contracts.
 *  Each is a feature Chrome recognises, so none of them logs an unrecognised-feature
 *  warning into a game's console. */
const SIGN_IN_PROMPTS_DENIED =
  "publickey-credentials-get=(), publickey-credentials-create=(), identity-credentials-get=(), otp-credentials=()";

/**
 * 2027-04: 2027-03 plus the isolation and edge SDK 2027-02 adds to 2026-11, and nothing
 * else. Where a threaded release frozen on 2027-03 is sealed, so that a threaded game keeps
 * the network it was frozen with (limits.json threadedMoves).
 *
 * COEP require-corp still applies to what such a game loads from elsewhere: a `fetch` or a
 * `crossorigin` script or image needs CORS, and a plain `<img>` or `<script>` without the
 * attribute needs a Cross-Origin-Resource-Policy header from the server, which many do not
 * send. That is the browser's rule for isolated documents, not ours; engines/threads.mdx
 * and guides/packaging.mdx tell creators the same.
 */
function contract2027_04(): RuntimeContract {
  const base = contract2027_03();
  return {
    ...base,
    version: "2027-04",
    permissionsPolicy: `${base.permissionsPolicy}, cross-origin-isolated=(self)`,
    crossOriginEmbedderPolicy: "require-corp",
    documentIsolationPolicy: "isolate-and-require-corp",
  };
}

/** The trusted hosts for one directive, from limits.json, space separated. */
function limitsTrusted(kind: "style" | "font"): string {
  const trusted = (limits as unknown as {
    trustedGameAssetOrigins?: Record<string, string[]>;
  }).trustedGameAssetOrigins;
  return (trusted?.[kind] ?? []).join(" ");
}

const CONTRACTS: Record<string, RuntimeContract> = {
  "2026-10": contract2026_10(),
  "2026-11": contract2026_11(),
  "2027-01": contract2027_01(),
  "2027-02": contract2027_02(),
  "2027-03": contract2027_03(),
  "2027-04": contract2027_04(),
};

/** The contract new versions are published under. */
export const CURRENT_CONTRACT = "2027-03";

/**
 * What a request with no contract, or one this Worker has never heard of, is answered
 * with. Not CURRENT_CONTRACT, and that split is new with 2027-03: the fallback used to be
 * the current contract on the argument that the current one is "at least as strict as
 * anything a game was reviewed against". The open network made that false. A deploy that
 * left KV naming a contract this Worker lacks must not hand a game more than it was
 * reviewed under, so the fallback is the strictest contract any live game is on.
 */
export const FALLBACK_CONTRACT = "2026-11";

/** Every contract this Worker can serve. Exported so the parity check can hold each one
 *  against the migration that recorded it, rather than only the newest. */
export const CONTRACT_VERSIONS = Object.keys(CONTRACTS);

/**
 * An unknown contract version means KV and this Worker disagree about what exists, which
 * is a deploy-ordering bug. It is answered with FALLBACK_CONTRACT, the strict one, never
 * with the current contract: see FALLBACK_CONTRACT for why those stopped being the same.
 */
export function contractFor(version: string | undefined): RuntimeContract {
  // A revoked contract (limits.json revokedServeAs, recorded by a migration setting
  // runtime_contracts.revoked_at) is answered with its target's headers, for every
  // release already pinned to it. X-Runtime-Contract then names the target, so the
  // site's isolated player, which checks it, refuses to open the game isolated.
  const served = servedContractVersion(version);
  const found = served === null ? undefined : CONTRACTS[served];
  return found ?? CONTRACTS[FALLBACK_CONTRACT]!;
}

/**
 * Whether a host or a version may be served only through its exact serving inventory.
 *
 * Three things each mean yes: the database's required flag, a bound large-asset input
 * (which only an inventory can carry), and a contract with a derived serving tree (only
 * 2027-01), whose documents load the host runtime and SDK that only a derived, inventoried
 * tree contains. Isolation alone is not one of them: 2027-02 serves an ordinary tree.
 * Every writer and reader of a host record refuses one that answers yes and has no pointer, and until
 * 22 Oct 2026 each spelled the rule out for itself, in ten places across og-games, the
 * hosting package and both apps. A null digest is a database column with no value.
 */
export function needsServingInventory(value: {
  servingInventoryRequired?: unknown;
  largeAssetInputDigest?: unknown;
  contractVersion?: unknown;
}): boolean {
  return value.servingInventoryRequired === true || (value.largeAssetInputDigest !== undefined && value.largeAssetInputDigest !== null) ||
    derivedContract(value.contractVersion);
}

/** Merge the floor over the contract, keeping the contract's directive order. */
export function policyFor(
  contract: RuntimeContract,
  extraFrameAncestors?: string,
  extraConnectSrc?: readonly string[],
): string {
  const directives: string[] = [];
  const seen = new Set<string>();

  /* Origins allowed to frame a game *in addition to* the two the contract names.
   *
   * This exists so the site can be run somewhere other than https://opengame.io —
   * a developer on localhost, or a preview deployment — without editing a contract
   * that is meant to be immutable and that published games depend on verbatim. It
   * is a Worker variable rather than a contract change precisely so it can be
   * removed in one edit and so its presence is visible in `wrangler deploy` output
   * rather than buried in a database row.
   *
   * Each entry must be a complete origin — scheme, host, and port where there is
   * one. Anything that is not is dropped rather than concatenated, because a
   * malformed frame-ancestors entry does not fail loudly, it silently widens or
   * voids the directive.
   *
   * NOT for production. `frame-ancestors` is what stops any page anywhere framing
   * somebody's game and dressing it up as their own, and every origin added here
   * is a page that may do exactly that. Unset it before launch. */
  /* A port wildcard is accepted for loopback and nowhere else.
     `http://localhost:*` is one entry that covers every dev server anybody runs, which
     matters because the previous fixed list named 4590 and 4591 and an agent told by
     AGENTS.md to take 4600 got a black frame with no error -- a `frame-ancestors`
     refusal is silent in the parent, so the only symptom is a game that does not
     appear. Loopback is not reachable from another machine, so widening it costs
     nothing; a wildcard on any routable host would be handing framing rights to
     whoever controls a port on it, which is the thing this directive exists to stop. */
  const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;
  const LOOPBACK_ANY_PORT = /^http:\/\/(localhost|127\.0\.0\.1):\*$/i;
  const extra = (extraFrameAncestors ?? "")
    .split(/[\s,]+/)
    .map((o) => o.trim())
    .filter((o) => ORIGIN.test(o) || LOOPBACK_ANY_PORT.test(o));

  /* Origins one game may connect to *in addition to* the contract's list.
   *
   * This is the per-game half of the no-external-calls rule, and it exists for exactly
   * one kind of game: one of ours, published by an owner, that already has a working
   * multiplayer stack somewhere else. Astral War's PeerJS signalling and lobby directory
   * were the reason, and Smash Royale's socket relay the only other user. Both went solo
   * for launch, and their servers were torn down on 5 Nov 2026. It stays because the
   * publish path still accepts `network` from an owner original, and a game on a contract
   * before 2027-03 has no other way to reach a host of its own. The list arrives on
   * the KV host record, which only the publish path writes, and that path refuses it for
   * any creator who is not one of ours -- so a creator upload cannot reach this. Each
   * entry has to be a complete https: or wss: origin; anything else is dropped rather
   * than concatenated, for the same reason `extra` above is. */
  const CONNECT_ORIGIN = /^(https|wss):\/\/[a-z0-9.-]+(:\d+)?$/i;
  const connectExtra = (extraConnectSrc ?? []).filter((o) => CONNECT_ORIGIN.test(o));

  for (const raw of contract.csp.split(";")) {
    const directive = raw.trim();
    if (directive === "") continue;
    const name = directive.split(/\s+/)[0]!;
    seen.add(name);
    const floored = SECURITY_FLOOR[name] ?? directive;
    directives.push(
      name === "frame-ancestors" && extra.length
        ? `${floored} ${extra.join(" ")}`
        : name === "connect-src" && connectExtra.length
          ? `${floored} ${connectExtra.join(" ")}`
          : floored,
    );
  }
  for (const [name, directive] of Object.entries(SECURITY_FLOOR)) {
    if (seen.has(name)) continue;
    directives.push(
      name === "frame-ancestors" && extra.length
        ? `${directive} ${extra.join(" ")}`
        : directive,
    );
  }
  return directives.join("; ");
}

/**
 * Every response leaves through here, including the interstitial and the tombstone, so a
 * game cannot find a path out of the Worker that skips a header.
 *
 * Two absences are deliberate. There is no `X-Frame-Options`: it has no value that means
 * "these two origins may frame me", so any value we set would contradict
 * `frame-ancestors`, and browsers that understand both prefer the header that is wrong.
 * And `Cross-Origin-Resource-Policy` is `cross-origin`, not `same-site` -- opengame.io and
 * opengame.gg are different sites by design, so `same-site` would stop the site loading a
 * game's own media as a subresource.
 */
export function securityHeaders(
  contract: RuntimeContract,
  extraFrameAncestors?: string,
  extraConnectSrc?: readonly string[],
): Headers {
  const headers = new Headers();
  headers.set("Content-Security-Policy", policyFor(contract, extraFrameAncestors, extraConnectSrc));
  headers.set("Permissions-Policy", contract.permissionsPolicy);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (contract.crossOriginEmbedderPolicy) headers.set("Cross-Origin-Embedder-Policy", contract.crossOriginEmbedderPolicy);
  if (contract.documentIsolationPolicy) headers.set("Document-Isolation-Policy", contract.documentIsolationPolicy);
  headers.set("X-Content-Type-Options", "nosniff");
  // A game should never learn which page embedded it, or which of our URLs a player
  // walked in from.
  headers.set("Referrer-Policy", "no-referrer");
  // Two years and every label under opengame.gg. Safe to assert because nothing here has
  // ever been reachable over plain HTTP -- Universal SSL fronts the whole zone -- and
  // because a game address that can be downgraded is a game address that can be
  // intercepted and replaced with anything. Deliberately without `preload`: the two
  // first-party origins carry that (see packages/shared/src/security.ts), and preloading a
  // domain whose entire purpose is hosting other people's code is a commitment worth
  // making on purpose rather than in passing.
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  headers.set("X-Runtime-Contract", contract.version);
  return headers;
}
