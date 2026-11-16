/**
 * A master chain, buses with separate volume and duck gains, and a voice pool that
 * steals the quietest voice with a short fade. Copy this file into the game; it imports
 * nothing and builds every node once.
 *
 *   import { createMasterChain, createVoicePool, selfTest } from "./audio-chain.js";
 *   const ctx = new AudioContext();
 *   const chain = createMasterChain(ctx);              // buses: sfx, music, ambience, voice, ui
 *   const voices = createVoicePool(chain, { max: 48 });
 *   voices.play(buffer, { bus: "sfx", gain: 0.8, priority: 1 });
 *   voices.play(hitConfirm, { bus: "ui", protect: true });
 *   chain.setVolume("music", 0.6);                     // the player's slider
 *   chain.duck("music", 6, 0.5);                       // under a voice line, after the lead
 *
 * The order matters and each stage has one job:
 *   master gain -> glue compressor -> make-up gain -> limiter -> soft clip -> output
 * The glue compressor holds overlapping sounds together without pumping. Make-up gain
 * sits BEFORE the limiter so the limiter's threshold is the real ceiling. A
 * DynamicsCompressorNode is not a brickwall: its attack lets the first millisecond of a
 * transient through, so a soft clip after it rounds what escapes. The clip here is
 * unity below its knee, so quiet sounds pass unchanged.
 *
 * Reference configuration: World at War and Modern Claudefare's mix (glue -15 dB, 4:1,
 * knee 14, 6 ms, 180 ms; limiter -1.2 dB, 20:1, 1 ms, 60 ms). Run `selfTest()` after
 * editing; it plants each defect this file prevents and fails unless it is caught.
 */

export const CHAIN_DEFAULTS = Object.freeze({
  buses: ["sfx", "music", "ambience", "voice", "ui"],
  glue: { threshold: -15, knee: 14, ratio: 4, attack: 0.006, release: 0.18 },
  makeupDb: 1.94,
  limiter: { threshold: -1.2, knee: 0, ratio: 20, attack: 0.001, release: 0.06 },
  clip: { knee: 0.6, ceiling: 0.97 },
  duck: { leadSeconds: 0.12, attackSeconds: 0.06, releaseSeconds: 0.35 },
});

export const dbToGain = (db) => Math.pow(10, db / 20);

/**
 * Unity below `knee`, then a tanh shoulder that approaches `ceiling` and never passes
 * it. Continuous in value and slope at the knee, so it adds no click of its own.
 */
export function softClipCurve({ knee, ceiling } = CHAIN_DEFAULTS.clip, samples = 4097) {
  const curve = new Float32Array(samples);
  const span = ceiling - knee;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

function setAll(param, values) { for (const [key, value] of Object.entries(values)) param[key].value = value; }

export function createMasterChain(ctx, options = {}) {
  const config = { ...CHAIN_DEFAULTS, ...options };
  const master = ctx.createGain();
  const glue = ctx.createDynamicsCompressor();
  setAll(glue, config.glue);
  const makeup = ctx.createGain();
  makeup.gain.value = dbToGain(config.makeupDb);
  const limiter = ctx.createDynamicsCompressor();
  setAll(limiter, config.limiter);
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve(config.clip);
  clip.oversample = "4x";
  master.connect(glue); glue.connect(makeup); makeup.connect(limiter); limiter.connect(clip); clip.connect(ctx.destination);

  const buses = {}, ducks = {}, duckUntil = {};
  for (const name of config.buses) {
    const volume = ctx.createGain(), duck = ctx.createGain();
    volume.connect(duck); duck.connect(master);
    buses[name] = volume; ducks[name] = duck; duckUntil[name] = 0;
  }
  const bus = (name) => {
    if (!Object.hasOwn(buses, name)) throw new Error(`no bus named ${name}`);
    return buses[name];
  };

  return {
    ctx, master, glue, makeup, limiter, clip, buses, ducks,
    /** Where a source connects. Volume and ducking live on separate gains so they never fight. */
    input: bus,
    setVolume(name, value) { bus(name).gain.setTargetAtTime(Math.max(0, value), ctx.currentTime, 0.015); },
    /**
     * Lowers a bus by `db` for `seconds`, starting after `leadSeconds` so the sound that
     * caused the duck is heard at full level first. Overlapping ducks keep the deepest.
     */
    duck(name, db, seconds, { leadSeconds = config.duck.leadSeconds, attackSeconds = config.duck.attackSeconds, releaseSeconds = config.duck.releaseSeconds } = {}) {
      bus(name);
      const gain = ducks[name].gain, now = ctx.currentTime;
      const start = now + leadSeconds, low = dbToGain(-Math.abs(db));
      const until = start + attackSeconds + seconds;
      if (duckUntil[name] > now && gain.value < low && until <= duckUntil[name]) return; // a deeper duck already holds
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.setValueAtTime(gain.value, start);
      gain.linearRampToValueAtTime(low, start + attackSeconds);
      gain.setValueAtTime(low, until);
      gain.linearRampToValueAtTime(1, until + releaseSeconds);
      duckUntil[name] = until + releaseSeconds;
    },
    dispose() {
      for (const node of [master, glue, makeup, limiter, clip, ...Object.values(buses), ...Object.values(ducks)]) node.disconnect();
    },
  };
}

/**
 * A bounded pool of one-shot voices. When full, the quietest unprotected voice is
 * faded over `stealFadeSeconds` and replaced; protected voices (hit confirmation,
 * announcer, warnings) go last. Voices are reclaimed by the time they were scheduled to
 * end, not by `onended`, because the event loop that delivers `onended` is the thing a
 * busy game starves.
 */
export function createVoicePool(chain, { max = 48, stealFadeSeconds = 0.006 } = {}) {
  const ctx = chain.ctx;
  const voices = new Set();
  const stats = { played: 0, stolen: 0, refused: 0 };

  function release(voice, at) {
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
    voice.gain.gain.linearRampToValueAtTime(0, at + stealFadeSeconds);
    try { voice.source.stop(at + stealFadeSeconds); } catch { /* already stopped */ }
    voice.until = at + stealFadeSeconds;
    voice.released = true;
  }
  function reap(now) { for (const voice of voices) if (voice.until > 0 && voice.until <= now) { voices.delete(voice); voice.gain.disconnect(); } }
  /** Loudness as heard: the voice's own gain times its bus volume, after its scheduled fades. */
  const heard = (voice) => voice.gain.gain.value * chain.input(voice.bus).gain.value;

  return {
    stats,
    get active() { return voices.size; },
    play(buffer, { bus = "sfx", gain = 1, rate = 1, when = 0, priority = 0, protect = false } = {}) {
      const now = ctx.currentTime;
      reap(now);
      const live = [...voices].filter((voice) => !voice.released);
      let stoleNow = false;
      if (live.length >= max) {
        const candidates = live.filter((voice) => !voice.protect && (voice.priority <= priority || protect));
        const pool = candidates.length ? candidates : protect ? live.filter((voice) => voice.priority <= priority) : [];
        if (!pool.length) { stats.refused++; return null; }
        const quietest = pool.reduce((a, b) => (heard(b) < heard(a) ? b : a));
        release(quietest, now);
        stats.stolen++;
        stoleNow = true;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const amp = ctx.createGain();
      amp.gain.value = gain;
      source.connect(amp); amp.connect(chain.input(bus));
      const start = Math.max(now, when);
      const voice = { source, gain: amp, bus, priority, protect, released: false,
        until: buffer && !source.loop ? start + buffer.duration / Math.max(rate, 1e-3) : 0 };
      // The stolen voice fades first; the new one starts after it so the two never sum.
      source.start(stoleNow ? Math.max(start, now + stealFadeSeconds) : start);
      voices.add(voice);
      stats.played++;
      return { stop: () => release(voice, ctx.currentTime), voice };
    },
    stopAll() { const now = ctx.currentTime; for (const voice of voices) if (!voice.released) release(voice, now); },
  };
}

/* ------------------------------------------------------------------------------------
 * Self-test. A small recording stand-in for an AudioContext: it keeps the graph and the
 * scheduled automation so the properties can be measured without a sound card. The same
 * checks run against a real context's chain in a browser, because they only read what
 * this file built.
 * ---------------------------------------------------------------------------------- */

class FakeParam {
  constructor(value) { this.value = value; this.events = []; }
  setValueAtTime(v, t) { this.events.push({ type: "set", v, t }); if (t <= 0) this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.events.push({ type: "ramp", v, t }); return this; }
  setTargetAtTime(v) { this.value = v; return this; }
  cancelScheduledValues(t) { this.events = this.events.filter((e) => e.t < t); return this; }
  /** Evaluates set and linear-ramp automation at time t. */
  at(t) {
    let value = this.value, time = -Infinity;
    for (const e of [...this.events].sort((a, b) => a.t - b.t)) {
      if (e.t > t) { if (e.type === "ramp") return value + (e.v - value) * ((t - time) / (e.t - time)); break; }
      value = e.v; time = e.t;
    }
    return value;
  }
}
class FakeNode {
  constructor(kind) { this.kind = kind; this.outputs = new Set(); }
  connect(node) { this.outputs.add(node); return node; }
  disconnect() { this.outputs.clear(); }
}
export function createFakeAudioContext() {
  const ctx = { currentTime: 0, destination: new FakeNode("destination") };
  ctx.createGain = () => Object.assign(new FakeNode("gain"), { gain: new FakeParam(1) });
  ctx.createDynamicsCompressor = () => Object.assign(new FakeNode("compressor"), Object.fromEntries(["threshold", "knee", "ratio", "attack", "release"].map((k) => [k, new FakeParam(0)])));
  ctx.createWaveShaper = () => Object.assign(new FakeNode("shaper"), { curve: null, oversample: "none" });
  ctx.createBufferSource = () => Object.assign(new FakeNode("source"), { buffer: null, loop: false, playbackRate: new FakeParam(1), startedAt: null, stoppedAt: null,
    start(t) { this.startedAt = t; }, stop(t) { this.stoppedAt = t; } });
  return ctx;
}

/** Every route from `node` to the destination, as lists of nodes. */
function routes(node, destination, path = []) {
  if (node === destination) return [[...path, node]];
  if (path.includes(node)) return [];
  return [...node.outputs].flatMap((next) => routes(next, destination, [...path, node]));
}

/**
 * The properties a mix depends on, read from a built chain. Returns failures.
 * `ctx` must be the context the chain was built on.
 */
export function chainProperties(chain) {
  const failures = [];
  const { ctx } = chain;
  for (const [name, input] of Object.entries(chain.buses)) {
    const all = routes(input, ctx.destination);
    if (!all.length) failures.push(`bus ${name} never reaches the output`);
    for (const route of all) {
      const li = route.indexOf(chain.limiter), ci = route.indexOf(chain.clip);
      if (li < 0 || ci < 0 || ci < li) failures.push(`bus ${name} reaches the output without passing the limiter and then the soft clip`);
    }
  }
  if (routes(chain.makeup, chain.limiter).length === 0) failures.push("make-up gain is not before the limiter, so the limiter threshold is not the ceiling");
  const curve = chain.clip.curve;
  if (!curve) failures.push("soft clip has no curve");
  else {
    let previous = -Infinity, peak = 0;
    for (const y of curve) { if (y < previous - 1e-7) { failures.push("soft clip curve is not monotonic"); break; } previous = y; peak = Math.max(peak, Math.abs(y)); }
    if (peak > 0.98) failures.push(`soft clip reaches ${peak.toFixed(3)}; it should stay below its ceiling`);
    const quiet = Math.pow(10, -8 / 20), index = Math.round(((quiet + 1) / 2) * (curve.length - 1));
    const x = (index / (curve.length - 1)) * 2 - 1, gainDb = 20 * Math.log10(curve[index] / x);
    if (Math.abs(gainDb) > 0.1) failures.push(`soft clip changes a -8 dBFS signal by ${gainDb.toFixed(2)} dB; it should pass quiet sound unchanged`);
  }
  return failures;
}

/** True when a duck leaves the causing sound at full level until its lead has passed. */
export function duckHoldsLead(chain, bus = "music", leadSeconds = CHAIN_DEFAULTS.duck.leadSeconds) {
  chain.ctx.currentTime = 10;
  chain.duck(bus, 9, 0.5);
  const param = chain.ducks[bus].gain;
  return Math.abs(param.at(10 + leadSeconds * 0.8) - 1) < 1e-6 && param.at(10 + leadSeconds + 0.2) < 0.5;
}

/** Fills a six-voice pool, plays one more, and reports which voice was stolen and how. */
export function stealBehaviour(makePool, chain) {
  const pool = makePool(chain);
  const buffer = { duration: 2 };
  chain.ctx.currentTime = 1;
  const gains = [0.9, 0.2, 0.7, 0.05, 0.8, 0.6];
  const handles = gains.map((gain, i) => pool.play(buffer, { bus: i === 3 ? "ui" : "sfx", gain, protect: i === 3 }));
  pool.play(buffer, { bus: "sfx", gain: 1 });
  const stolen = handles.filter((h) => h && h.voice.released).map((h) => h.voice);
  const victim = stolen[0];
  const now = chain.ctx.currentTime;
  return {
    count: stolen.length,
    gain: victim ? victim.gain.gain.value : null,
    protectedStolen: stolen.some((v) => v.protect),
    fadeSeconds: victim ? (victim.source.stoppedAt ?? now) - now : null,
    fadeEndsAtZero: victim ? victim.gain.gain.at(now + 0.0061) === 0 && victim.gain.gain.at(now + 0.003) > 0 : false,
  };
}

/** What a player would hear wrong in a steal: the wrong voice, a protected one, or a click. */
export function stealFailures(steal) {
  const failures = [];
  if (steal.count !== 1) failures.push(`stealing released ${steal.count} voices for one new sound`);
  if (steal.gain !== 0.2) failures.push(`stole a voice at gain ${steal.gain}; the quietest unprotected voice was 0.2`);
  if (steal.protectedStolen) failures.push("stole a protected voice while unprotected ones were playing");
  if (!(Math.abs(steal.fadeSeconds - 0.006) < 1e-9) || !steal.fadeEndsAtZero) failures.push("a stolen voice was not faded to zero over 6 ms before stopping");
  return failures;
}

/** The pool most games start with: the oldest voice goes, with a hard stop. */
function plantedOldestPool(chain) {
  const played = [];
  return {
    play(buffer, { bus = "sfx", gain = 1, protect = false } = {}) {
      const now = chain.ctx.currentTime;
      if (played.length >= 6) {
        const first = played.shift();
        first.voice.released = true;
        first.voice.gain.gain.setValueAtTime(0, now);
        first.voice.source.stop(now);
      }
      const source = chain.ctx.createBufferSource(), amp = chain.ctx.createGain();
      amp.gain.value = gain; source.connect(amp); amp.connect(chain.input(bus)); source.start(now);
      const handle = { voice: { source, gain: amp, protect, released: false } };
      played.push(handle);
      return handle;
    },
  };
}

export function selfTest() {
  const failures = [];
  const fresh = (options) => createMasterChain(createFakeAudioContext(), options);

  // Planted: a bus wired straight to the output, around the limiter.
  const bypass = fresh(); bypass.ducks.sfx.connect(bypass.ctx.destination);
  if (!chainProperties(bypass).some((f) => f.includes("bus sfx"))) failures.push("planted bus bypass was not caught");
  // Planted: a tanh curve scaled to its ceiling, which adds about 4.5 dB to quiet sound.
  const loud = fresh(); const K = 1.6, norm = 0.97 / Math.tanh(K);
  loud.clip.curve = Float32Array.from({ length: 4097 }, (_, i) => Math.tanh(((i / 4096) * 2 - 1) * K) * norm);
  if (!chainProperties(loud).some((f) => f.includes("-8 dBFS"))) failures.push("planted gain-adding clip curve was not caught");
  // Planted: a duck with no lead.
  if (duckHoldsLead(fresh({ duck: { ...CHAIN_DEFAULTS.duck, leadSeconds: 0 } }))) failures.push("planted duck without a lead was not caught");
  // Planted: the oldest voice stolen with a hard stop.
  if (!stealFailures(stealBehaviour(plantedOldestPool, fresh())).length) failures.push("planted oldest-voice pool was not caught");

  // The real chain.
  failures.push(...chainProperties(fresh()));
  if (!duckHoldsLead(fresh())) failures.push("duck lowers the bus before its lead has passed");
  failures.push(...stealFailures(stealBehaviour((chain) => createVoicePool(chain, { max: 6 }), fresh())));
  return { ok: failures.length === 0, examined: 7, failures };
}
