import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function assessEvidence({ before, after, framesMs, pageErrors }, criteria) {
  const coordinate = value => Array.isArray(value) && value.length > 0 && value.every(Number.isFinite);
  if (!coordinate(before) || !coordinate(after) || before.length !== after.length || !framesMs.length || !framesMs.every(value => Number.isFinite(value) && value > 0)) throw new Error("Missing position or frame-time evidence.");
  if (!Number.isFinite(criteria.movementMin) || criteria.movementMin <= 0 || !Number.isFinite(criteria.frameP95MsMax) || criteria.frameP95MsMax <= 0) throw new Error("Provide positive game-specific movement and frame-time limits.");
  const distance = Math.hypot(...after.map((value, index) => value - before[index]));
  const sorted = [...framesMs].sort((a, b) => a - b);
  const frameP95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
  return { ok: distance >= criteria.movementMin && frameP95Ms <= criteria.frameP95MsMax && pageErrors.length === 0,
    distance, frameP95Ms, frameSamples: framesMs.length, pageErrors: [...pageErrors], criteria };
}

/** Drive player input and measure the game's position contract, rather than inferring
 * movement from changed pixels. The host chooses its own tolerances and soak budget. */
export async function browserEvidence(config) {
  const url = new URL(config.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP(S) game URL without credentials.");
  const require = createRequire(resolve(process.cwd(), "package.json"));
  const { chromium } = require("playwright");
  const holdMs = config.holdMs ?? 500;
  const soakMs = config.soakMs ?? 1000;
  const throttle = config.cpuThrottle ?? 1;
  if (![holdMs, soakMs, throttle].every(value => Number.isFinite(value) && value > 0) || !Array.isArray(config.statePath) || !Array.isArray(config.positionPath) || !config.playSelector || !config.key || !config.screenshot) throw new Error("Specify statePath, positionPath, playSelector, key, screenshot and positive measurement budgets.");
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: config.viewport ?? { width: 1280, height: 720 }, serviceWorkers: "block" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    await session.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    const start = performance.now();
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: config.loadTimeoutMs ?? 30000 });
    await page.locator(config.playSelector).click();
    await page.waitForFunction(({ statePath, positionPath }) => {
      const read = (value, path) => path.reduce((node, key) => node?.[key], value);
      const position = read(read(window, statePath), positionPath);
      return Array.isArray(position) && position.length > 0 && position.every(Number.isFinite);
    }, { statePath: config.statePath, positionPath: config.positionPath });
    const position = () => page.evaluate(({ statePath, positionPath }) => {
      const read = (value, path) => path.reduce((node, key) => node?.[key], value);
      return read(read(window, statePath), positionPath);
    }, { statePath: config.statePath, positionPath: config.positionPath });
    const before = await position();
    await page.keyboard.down(config.key);
    await page.waitForTimeout(holdMs);
    await page.keyboard.up(config.key);
    const after = await position();
    const framesMs = await page.evaluate(duration => new Promise(resolve => {
      const frames = []; let previous = null; let stopped = false;
      const tick = now => { if (stopped) return; if (previous !== null) frames.push(now - previous); previous = now; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      setTimeout(() => { stopped = true; resolve(frames); }, duration);
    }), soakMs);
    await mkdir(dirname(resolve(config.screenshot)), { recursive: true });
    await page.screenshot({ path: resolve(config.screenshot), fullPage: true });
    return { ...assessEvidence({ before, after, framesMs, pageErrors: errors }, config.criteria), coldLoadToCaptureMs: performance.now() - start,
      holdMs, soakMs, cpuThrottle: throttle, screenshot: resolve(config.screenshot) };
  } finally { await browser.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await browserEvidence(JSON.parse(await readFile(process.argv[2], "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
