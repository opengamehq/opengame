/**
 * A byte count the way a person reads it, in the binary units the bundle limits are
 * written in ("200 MiB", "250 MiB"), so a limit and the build measured against it never
 * disagree by the 5% between MB and MiB.
 *
 * Rounded DOWN by default, because most of these numbers say how much room is left, and
 * rounding 1023.6 KiB up to "1 MiB" or 4.97 GiB left up to "5 GiB" promises space that is
 * not there. A size being refused for crossing a limit rounds UP instead: rounded down, a
 * build one byte over 250 MiB read "250 MiB, over the 250 MiB limit", which contradicts
 * itself. Each side rounds away from the answer the person wants to hear. One decimal
 * below 10, whole numbers above.
 */
export function readableBytes(bytes: number, round: "down" | "up" = "down"): string {
  const step = round === "up" ? Math.ceil : Math.floor;
  if (!Number.isFinite(bytes) || bytes < 1024) {
    const whole = Math.max(0, step(Number.isFinite(bytes) ? bytes : 0));
    return `${whole} ${whole === 1 ? "byte" : "bytes"}`;
  }
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  const shown = value >= 10 ? step(value) : step(value * 10) / 10;
  return `${shown} ${units[unit]}`;
}
