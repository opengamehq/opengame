import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKED_PACKAGES, BLOCKED_SERVICES, blockedPackageForUrl, blockedPatternHits, blockedServiceForHost, policyRule, reviewSignalHits } from '@opengame/shared/game-policy';
import { platformPreflight } from '../src/platform';
import type { PreflightFile } from '../src/index';

/* The open network, 26 Oct 2026. New uploads are published under 2027-03: a game may call
   an AI model, any API, its own multiplayer server and a script CDN, and may use eval.
   What it may not do is short and lives in limits.json `gamePolicy`: take money, touch
   crypto, make a player sign up or give an email, show ads, carry ad pixels or session
   recording. A CSP cannot say any of that, so the preflight is part of the control now,
   and these are the cases it has to get right in both directions. */

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const page = '<!doctype html><html><body><canvas id="game"></canvas><script type="module" src="./game.js"></script></body></html>';
const game = (code: string, html = page) => platformPreflight([file('index.html', html), file('game.js', code)]);
type Result = Awaited<ReturnType<typeof game>>;
const policy = (result: Result) => result.findings.filter((f) => f.code === 'blocked-service');
const blockers = (result: Result) => result.findings.filter((f) => f.severity === 'blocker');
const note = (result: Result) => result.findings.find((f) => f.code === 'external-hosts');

/* -------------------------------------------------------------------------- */
/* The probe corpus, which Python is held to as well                           */
/* -------------------------------------------------------------------------- */

const probes = JSON.parse(readFileSync(new URL('../../shared/game-policy-probes.json', import.meta.url), 'utf8')) as {
  patterns: { service: string; severity: string; pattern: string; flags: string; matches: string[]; misses: string[] }[];
  reviewSignals: { label: string; pattern: string; flags: string; matches: string[]; misses: string[] }[];
  decoys: string[];
  hosts: { blocked: { host: string; service: string }[]; allowed: string[] };
  packages: { url: string; service: string | null }[];
  bundles: { id: string; verdict: 'blocker' | 'warning' | 'pass'; why: string; files: Record<string, string> }[];
};

test('every gamePolicy pattern has probes, keyed by its exact text', () => {
  const inLimits = BLOCKED_SERVICES.flatMap((s) => s.patterns.map((p) => `${s.name}\u0000${p.pattern}\u0000${p.flags}\u0000${p.severity}`));
  const probed = probes.patterns.map((p) => `${p.service}\u0000${p.pattern}\u0000${p.flags}\u0000${p.severity}`);
  assert.deepEqual(probed, inLimits);
  for (const p of probes.patterns) assert.ok(p.matches.length > 0 && p.misses.length > 0, p.pattern);
});

test('each probe fires its own pattern, and each miss does not', () => {
  for (const p of probes.patterns) {
    const re = new RegExp(p.pattern, p.flags);
    for (const text of p.matches) {
      assert.ok(re.test(text), `${p.service} should fire on ${text}`);
      assert.ok(blockedPatternHits(text).some((h) => h.service === p.service && h.severity === p.severity), text);
    }
    for (const text of p.misses) assert.equal(re.test(text), false, `${p.service} fired on its miss ${text}`);
  }
  for (const s of probes.reviewSignals) {
    for (const text of s.matches) assert.ok(reviewSignalHits(text).some((h) => h.label === s.label), text);
    for (const text of s.misses) assert.equal(reviewSignalHits(text).some((h) => h.label === s.label), false, text);
  }
});

test('a decoy fires nothing, and the host table answers every probe', () => {
  for (const text of probes.decoys) {
    assert.deepEqual(blockedPatternHits(text), [], text);
    assert.deepEqual(reviewSignalHits(text), [], text);
  }
  for (const { host, service } of probes.hosts.blocked) assert.equal(blockedServiceForHost(host)?.name, service, host);
  for (const host of probes.hosts.allowed) assert.equal(blockedServiceForHost(host), null, host);
});

test('every package probe names its service, and every blocked package group has one', () => {
  for (const { url, service } of probes.packages) assert.equal(blockedPackageForUrl(url)?.service ?? null, service, url);
  const named = new Set(probes.packages.map((p) => p.service));
  for (const group of BLOCKED_PACKAGES) assert.ok(named.has(group.name), group.name);
});

/* -------------------------------------------------------------------------- */
/* The bundles content.py is held to as well                                   */
/* -------------------------------------------------------------------------- */

/* The same verdicts apps/pipeline/tests/test_game_policy.py asks of the jam scan. Until
   26 Oct 2026 twenty of these were a blocker here and only a mention there. */
const verdict = (result: Result) =>
  policy(result).some((f) => f.severity === 'blocker') ? 'blocker' : policy(result).length ? 'warning' : 'pass';

for (const bundle of probes.bundles) {
  test(`shared bundle ${bundle.id}: ${bundle.verdict}, because ${bundle.why}`, async () => {
    const result = await platformPreflight(Object.entries(bundle.files).map(([path, content]) => file(path, content)));
    assert.equal(verdict(result), bundle.verdict, JSON.stringify(policy(result).map((f) => [f.severity, f.title])));
  });
}

test('the server reads a whole long file for the policy, and the wizard keeps its budget', async () => {
  const pad = 'const pad = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];\n'.repeat(80_000);
  const code = `${pad}const s = Stripe("pk_live_abc");\n`;
  assert.ok(code.length > 5_000_000);
  const result = await game(code);
  assert.equal(result.ok, false);
  assert.ok(policy(result).some((f) => f.severity === 'blocker' && f.title === `game.js line ${80_001} uses Stripe.`), JSON.stringify(policy(result)));
});

test('a shipped source file is read for the policy, and only warns', async () => {
  const result = await platformPreflight([file('index.html', page), file('game.js', 'start();'),
    file('src/pay.ts', 'const s = Stripe("pk_live_abc");\nfetch("https://api.stripe.com/v1/x");\n')]);
  const rows = policy(result);
  assert.deepEqual(rows.map((f) => [f.severity, f.title]).sort(), [
    ['warning', 'src/pay.ts line 1 uses Stripe.'],
    ['warning', 'src/pay.ts line 2 reaches api.stripe.com, Stripe.'],
  ]);
  assert.ok(rows.every((f) => f.detail!.includes('source file')), JSON.stringify(rows));
  assert.equal(result.ok, true);
});

/* -------------------------------------------------------------------------- */
/* What stays blocked                                                          */
/* -------------------------------------------------------------------------- */

test('a request to a blocked service is a blocker that names it and states the rule', async () => {
  const result = await game('const s = document.createElement("script"); s.src = "https://js.stripe.com/v3/"; document.head.append(s);');
  assert.equal(result.ok, false);
  const [row] = policy(result);
  assert.equal(row?.severity, 'blocker');
  assert.equal(row?.title, 'game.js line 1 reaches js.stripe.com, Stripe.');
  assert.equal(row?.detail, `${policyRule('payments')} Remove it and the code that uses it, then check again.`);
});

test('a script tag, a fetch and an import from a blocked host each block', async () => {
  for (const [code, html, host] of [
    ['start();', page.replace('</body>', '<script src="https://js.stripe.com/v3/"></script></body>'), 'js.stripe.com'],
    ['fetch("https://api.stripe.com/v1/payment_intents", { method: "POST" });', page, 'api.stripe.com'],
    ['import { createAppKit } from "https://cdn.walletconnect.com/appkit.js";', page, 'cdn.walletconnect.com'],
    ['const w = await import("https://esm.web3modal.org/x.js");', page, 'esm.web3modal.org'],
    ['new Image().src = "https://www.google-analytics.com/collect?v=1";', page, 'www.google-analytics.com'],
  ] as const) {
    const result = await game(code, html);
    assert.equal(result.ok, false, code);
    assert.ok(policy(result).some((f) => f.severity === 'blocker' && f.title.includes(`reaches ${host},`)), `${code}: ${JSON.stringify(policy(result))}`);
  }
});

test('the code shapes of a wallet, a sign-in and a pixel block wherever the SDK came from', async () => {
  for (const [code, service, category] of [
    /* Not window.ethereum since 26 Oct 2026: the wallet signatures are warnings, because
       supabase-js carries eth_requestAccounts in every build (limits.json
       `_walletSignaturesAreWarnings`). A miner's is still a blocker. */
    ['const miner = new CoinHive.Anonymous("site-key"); miner.start();', 'a crypto miner', 'crypto'],
    ['google.accounts.id.initialize({ client_id: CLIENT, callback });', 'Google sign-in', 'accounts'],
    ['FB.login(function (r) { start(r); }, { scope: "email" });', 'Facebook login', 'accounts'],
    ['const stripe = Stripe("pk_test_abc"); stripe.redirectToCheckout({ sessionId });', 'Stripe', 'payments'],
    ['PokiSDK.commercialBreak().then(resume);', 'a game portal SDK', 'ads'],
  ] as const) {
    const result = await game(code);
    assert.equal(result.ok, false, code);
    const row = policy(result).find((f) => f.severity === 'blocker' && f.title === `game.js line 1 uses ${service}.`);
    assert.ok(row, `${code}: ${JSON.stringify(policy(result))}`);
    assert.ok(row!.detail!.startsWith(policyRule(category)), code);
  }
});

test('a wallet library naming window.ethereum forty times is one finding', async () => {
  const result = await game(Array.from({ length: 40 }, (_, n) => `const p${n} = window.ethereum;`).join('\n'));
  assert.equal(policy(result).length, 1);
  assert.equal(policy(result)[0]!.line, 1);
});

test('a policy shape in a comment, a console message or a library manifest is not a call', async () => {
  for (const code of [
    '// window.ethereum is checked by the wallet plugin we removed\nstart();',
    '/* google.accounts.id.initialize(...) */ start();',
    'console.warn("FB.login( is not available here");',
    'var pkg={"name":"x","homepage":"https://ko-fi.com/maker"};',
  ]) {
    const result = await game(code);
    assert.deepEqual(policy(result), [], code);
    assert.equal(result.ok, true, code);
  }
});

test('Firebase email sign-in is a warning, and anonymous sign-in is nothing', async () => {
  const email = await game('import { getAuth, signInWithEmailAndPassword } from "./firebase.js"; signInWithEmailAndPassword(getAuth(), e, p);');
  const row = policy(email).find((f) => f.title === 'game.js line 1 uses Firebase email sign-in.');
  assert.equal(row?.severity, 'warning');
  assert.match(row!.detail!, /does not stop the upload/);
  assert.equal(blockers(email).some((f) => f.code === 'blocked-service'), false);

  const anonymous = await game('import { getAuth, signInAnonymously } from "./firebase.js"; signInAnonymously(getAuth());');
  assert.deepEqual(policy(anonymous), []);
  assert.deepEqual(anonymous.findings.filter((f) => f.code === 'review-signal'), []);
});

/* -------------------------------------------------------------------------- */
/* What is allowed now                                                         */
/* -------------------------------------------------------------------------- */

test('an AI API, a game server over wss and a CDN import are allowed, and named once', async () => {
  const code = [
    'import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";',
    'const reply = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", body });',
    'await fetch("https://api.anthropic.com/v1/messages", { method: "POST", body });',
    'const ws = new WebSocket("wss://lobby.mygame.example/room");',
    'const again = new WebSocket("wss://lobby.mygame.example/other");',
  ].join('\n');
  const result = await game(code);
  assert.deepEqual(blockers(result), [], JSON.stringify(result.findings));
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings.filter((f) => f.code === 'outbound-origin'), []);
  const named = note(result)!;
  assert.equal(named.severity, 'note');
  assert.equal(named.title, 'This game names 4 hosts outside OpenGame: cdn.jsdelivr.net, api.openai.com, api.anthropic.com and lobby.mygame.example.');
  assert.deepEqual(named.more, [
    'game.js line 1 → cdn.jsdelivr.net', 'game.js line 2 → api.openai.com', 'game.js line 3 → api.anthropic.com', 'game.js line 4 → lobby.mygame.example',
  ]);
});

test('the external-hosts note lists eight hosts and counts the rest', async () => {
  const code = Array.from({ length: 11 }, (_, n) => `fetch("https://api${n}.example.com/x");`).join('\n');
  const result = await game(code);
  assert.equal(note(result)?.title, 'This game names 11 hosts outside OpenGame: api0.example.com, api1.example.com, api2.example.com, api3.example.com, api4.example.com, api5.example.com, api6.example.com, api7.example.com and 3 more.');
  assert.equal(note(result)?.more?.length, 8);
  assert.equal(result.ok, true);
});

test('a game that names nothing outside OpenGame gets no note', async () => {
  const result = await game('fetch("./levels.json"); fetch("https://api.opengame.gg/v1/x");');
  assert.equal(note(result), undefined);
});

test('a plain http or ws request is still a blocker, because the page is https', async () => {
  for (const [code, host] of [
    ['fetch("http://api.mygame.example/score");', 'api.mygame.example'],
    ['const ws = new WebSocket("ws://lobby.mygame.example:8080/");', 'lobby.mygame.example'],
  ] as const) {
    const result = await game(code);
    assert.equal(result.ok, false, code);
    const row = result.findings.find((f) => f.code === 'outbound-origin' && f.severity === 'blocker');
    assert.equal(row?.title, `game.js line 1 reaches ${host} over plain http.`, code);
    assert.match(row!.detail!, /https/);
  }
  // A secure WebSocket to the same host is allowed.
  assert.equal((await game('new WebSocket("wss://lobby.mygame.example:8080/");')).ok, true);
});

/* -------------------------------------------------------------------------- */
/* What a reviewer looks at                                                    */
/* -------------------------------------------------------------------------- */

test('an email field is a review signal, not a blocker, and a commented one is nothing', async () => {
  const html = page.replace('<canvas id="game"></canvas>', '<canvas id="game"></canvas>\n<form><input type="email" name="e"><input type="password" name="p"></form>');
  const result = await game('start();', html);
  assert.equal(result.ok, true);
  const signals = result.findings.filter((f) => f.code === 'review-signal');
  assert.deepEqual(signals.map((f) => [f.severity, f.title]), [
    ['warning', 'index.html line 2 has an email field.'],
    ['warning', 'index.html line 2 has a password field.'],
  ]);
  assert.match(signals[0]!.detail!, /Make sure a player can start the game without signing up/);

  const commented = await game('start();', page.replace('<canvas', '<!-- <input type="email"> --><canvas'));
  assert.deepEqual(commented.findings.filter((f) => f.code === 'review-signal'), []);
});

test('a relay the game names is a warning about players\' addresses, not about the CSP', async () => {
  const result = await game('const pc = new RTCPeerConnection({ iceServers: [{ urls: "turn:relay.mygame.example:3478" }] });');
  const row = result.findings.find((f) => f.code === 'ice-server');
  assert.equal(row?.severity, 'warning');
  assert.match(row!.detail!, /IP addresses go through it/);
  assert.doesNotMatch(row!.detail!, /CSP/);
  assert.equal(result.ok, true);
});

/* Trailer Park Warfare, 12 Nov 2026: PeerJS unchanged, with its default relays, and three
   warnings asking for a description of servers every PeerJS game dials. */
test("a WebRTC library's public default relays are one note, and another relay is still a warning", async () => {
  const peer = 'const d={iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:["turn:eu-0.turn.peerjs.com:3478","turn:us-0.turn.peerjs.com:3478"],username:"peerjs",credential:"peerjsp"}]};';
  const result = await game(peer);
  const rows = result.findings.filter((f) => f.code === 'ice-server');
  assert.deepEqual(rows.map((f) => f.severity), ['note']);
  assert.match(rows[0]!.title, /stun\.l\.google\.com, eu-0\.turn\.peerjs\.com and us-0\.turn\.peerjs\.com/);
  assert.match(rows[0]!.detail!, /Nothing has to change/);
  assert.equal(result.ok, true);
  const mixed = (await game(peer + ' const mine={iceServers:[{urls:"turn:relay.mygame.example:3478"}]};'))
    .findings.filter((f) => f.code === 'ice-server');
  assert.deepEqual(mixed.map((f) => f.severity).sort(), ['note', 'warning']);
  // A look-alike under somebody else's name is not the library's.
  const lookalike = (await game('const c={iceServers:[{urls:"turn:turn.peerjs.com.evil.example:3478"}]};'))
    .findings.filter((f) => f.code === 'ice-server');
  assert.deepEqual(lookalike.map((f) => f.severity), ['warning']);
});

test('no finding still says a game may only reach OpenGame', async () => {
  const result = await game('fetch("https://api.mygame.example/x"); const v = {cfg:"http://plain.example/x"}; new WebSocket("wss://ok.example/");');
  for (const f of result.findings) assert.doesNotMatch(`${f.title} ${f.detail ?? ''}`, /may only reach|refused by the CSP/, f.code);
});
