export type RuntimePolicy = {
  sampleRate: number; sampleWindowMs: number; sampleIntervalMs: number;
  samplesPerSessionMax: number; errorsPerSessionMax: number; errorIntervalMs: number;
};

/** Browser frame cadence, not a claim about the game's simulation or GPU time.
 * No resource name, message, stack, key or pointer coordinate leaves this collector. */
export function runtimeHealth(win: Window, policy: RuntimePolicy,
  active: () => boolean, record: (name: string, props: Record<string, unknown>) => boolean) {
  let stopped = false, frame = 0, timer: ReturnType<typeof setInterval> | undefined;
  let samples = 0, errors = 0, lastError = -Infinity;
  const pending: Record<string, unknown>[] = [];
  const sampled = Math.random() < policy.sampleRate;
  const flush = () => {
    while (pending.length && record('runtime_error', pending[0]!)) pending.shift();
  };
  const onError = (event: Event) => {
    const now = Date.now();
    if (stopped || errors >= policy.errorsPerSessionMax || now - lastError < policy.errorIntervalMs) return;
    errors++; lastError = now;
    const rejection = event.type === 'unhandledrejection';
    let name: unknown;
    // The error itself stays in this realm. Even its name is reduced to a fixed
    // category: games can throw strings or Error subclasses containing player data.
    try { name = (rejection ? (event as PromiseRejectionEvent).reason : (event as ErrorEvent).error)?.name; } catch { /* hostile getter */ }
    const kinds: Record<string, string> = { TypeError: 'type_error', RangeError: 'range_error', ReferenceError: 'reference_error', SyntaxError: 'syntax_error', SecurityError: 'security_error', NetworkError: 'network_error', Error: 'error' };
    pending.push({ result: typeof name === 'string' && Object.hasOwn(kinds, name) ? kinds[name] : 'unknown',
      step: rejection ? 'rejection' : event.target && event.target !== win ? 'resource' : 'exception' });
    flush();
  };
  const sample = () => {
    flush();
    if (!sampled || stopped || frame || samples >= policy.samplesPerSessionMax || !active() || !win.requestAnimationFrame) return;
    let first: number | undefined, intervals = 0;
    const tick = (now: number) => {
      frame = 0;
      if (stopped || !active()) return;
      if (first === undefined) first = now; else intervals++;
      const elapsed = now - first;
      if (elapsed < policy.sampleWindowMs) { frame = win.requestAnimationFrame(tick); return; }
      const props: Record<string, unknown> = { fps: intervals * 1000 / elapsed, sample_rate: policy.sampleRate };
      const memory = (win.performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
      if (typeof memory === 'number' && Number.isFinite(memory) && memory >= 0) props.heap_mb = memory / (1024 * 1024);
      if (record('runtime_performance', props)) samples++;
    };
    frame = win.requestAnimationFrame(tick);
  };
  win.addEventListener('error', onError, true);
  win.addEventListener('unhandledrejection', onError);
  return {
    reset() {
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0; pending.length = 0;
    },
    resume() {
      flush();
      if (!active()) { if (frame) win.cancelAnimationFrame(frame); frame = 0; clearInterval(timer); timer = undefined; return; }
      if (sampled && !stopped) { sample(); if (!timer) timer = setInterval(sample, policy.sampleIntervalMs); }
    },
    stop() {
      stopped = true; clearInterval(timer);
      if (frame) win.cancelAnimationFrame(frame);
      pending.length = 0;
      win.removeEventListener('error', onError, true);
      win.removeEventListener('unhandledrejection', onError);
    },
  };
}
