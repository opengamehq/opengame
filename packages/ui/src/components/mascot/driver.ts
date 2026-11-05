import { STILL_POSE, formatMascot, mascotFrame, type MascotFrame, type MascotLook, type MascotPose } from "../mascot-art";

/* Here rather than beside the canvas that first used it, because the CLI draws the same
   character in a terminal and has to behave as the same creature: one clock for the
   blink, the glance and the colour dissolve, wherever the face is. The web had its own
   copy at apps/web/src/components/avatar/mascot-driver.ts, identical but for where it
   imported the art from. It was deleted when pf/cli-mascot merged into the launch
   candidate, and the web's faces import this one, so there is one driver rather than two
   that agree today. */

/**
 * What the character is doing from one frame to the next.
 *
 * The art module draws a pose and has no clock; this is the clock. It owns the four
 * things that make the character feel alive rather than animated -- it blinks on its own
 * schedule, it looks at the pointer, it breathes, and it answers a change by doing
 * something about it -- and every live face in the product runs one of these, so the
 * one in the top bar and the one on the onboarding stage behave as the same creature.
 *
 * ## How a change is answered
 *
 * A new shape morphs, the old distance field sliding into the new one. A new colour
 * dissolves through an 8x8 ordered dither, which is the logo's own texture used as a
 * transition. New eyes wait for a blink and swap while the lids are shut, so the face is
 * never seen mid-swap. A new accessory drops onto the head from above, and putting one
 * on or taking the last one off eases the framing between the bare box and the dressed
 * one rather than snapping the body to a new size. All of them come with a small hop. None of that is UI motion, which
 * does not bounce here; it is a character, and a character that lands flat reads as
 * broken rather than restrained.
 *
 * ## Reduced motion
 *
 * `still` turns all of it off: no breath, no hop, no glance, no blink, and changes land
 * at once. The face still points at the logo's glance, so nothing reads as missing.
 */

const MORPH_MS = 380;
const DISSOLVE_MS = 460;
const HOP_MS = 520;
const BLINK_MS = 150;
const DROP_MS = 420;
/** How far above its seat a new accessory starts, in body units. */
const DROP_FROM = 0.5;

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class MascotDriver {
  look: MascotLook;
  /** The eyes on screen, which trail `look.eyes` until the next shut lid. */
  private shownEyes: MascotLook["eyes"];
  private pose: MascotPose = { ...STILL_POSE };
  private morph = { from: null as MascotLook["shape"] | null, at: 0 };
  private dissolve = { from: null as MascotLook["color"] | null, at: 0 };
  private reframe = { from: null as MascotFrame | null, at: 0 };
  private dropAt = -Infinity;
  private hopAt = -Infinity;
  private hopSize = 1;
  private blinkAt = 0;
  private nextBlink = 0;
  private aim = { x: STILL_POSE.lookX, y: STILL_POSE.lookY };
  private aimAt = 0;
  private idleAim = { x: STILL_POSE.lookX, y: STILL_POSE.lookY };
  private nextIdle = 0;
  /** Set by a poke or a celebration: happy eyes for a moment, whatever was picked. */
  private gleeUntil = 0;
  still: boolean;

  constructor(look: MascotLook, now: number, still = false) {
    this.look = look;
    this.shownEyes = look.eyes;
    this.still = still;
    this.nextBlink = now + 1200 + Math.random() * 2000;
    this.nextIdle = now + 2500;
  }

  /** A new look. Each part that changed starts its own transition from where it is. */
  set(next: MascotLook, now: number) {
    const prev = this.look;
    if (formatMascot(next) === formatMascot(prev)) return;
    if (this.still) {
      this.look = next;
      this.shownEyes = next.eyes;
      return;
    }
    /* A click mid-morph starts from the last target rather than the blend on screen. At
       these durations the difference is a frame or two and nobody can see it. */
    if (next.shape !== prev.shape) this.morph = { from: prev.shape, at: now };
    if (next.color !== prev.color) this.dissolve = { from: prev.color, at: now };
    if (next.eyes !== prev.eyes) this.blinkAt = now; // the swap happens at the shut point
    if ((next.accessory ?? "none") !== (prev.accessory ?? "none")) {
      if (next.accessory && next.accessory !== "none") this.dropAt = now;
      const from = this.currentFrame(now);
      if (from !== mascotFrame(next)) this.reframe = { from, at: now };
    }
    this.look = next;
    this.hop(now, next.shape !== prev.shape ? 1 : 0.7);
  }

  /** Where to look, as -1 to 1 from the face's centre. */
  point(x: number, y: number, now: number) {
    this.aim = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    this.aimAt = now;
  }

  hop(now: number, size = 1) {
    if (this.still) return;
    this.hopAt = now;
    this.hopSize = size;
  }

  /** A poke, or the end of onboarding: a hop and a moment of happy eyes. */
  cheer(now: number, ms = 900) {
    if (this.still) return;
    this.hop(now, 1.25);
    this.gleeUntil = now + ms;
  }

  /**
   * Whether anything is moving: a hop, a morph, a dissolve, a blink, a cheer, or eyes
   * still travelling toward where they were sent. A small face in the top bar is on every
   * page, so it draws only while this is true and sleeps until `nextWake` otherwise; the
   * breath is the one motion it gives up, and at 26 pixels it was one cell.
   */
  settled(now: number): boolean {
    if (this.still) return true;
    if (now - this.hopAt < HOP_MS || now - this.blinkAt < BLINK_MS || now < this.gleeUntil) return false;
    if (this.morph.from || this.dissolve.from || this.reframe.from || this.shownEyes !== this.look.eyes) return false;
    if (now - this.dropAt < DROP_MS) return false;
    const target = now - this.aimAt > 2600 ? this.idleAim : this.aim;
    const p = this.pose;
    return (
      Math.abs(target.x - p.lookX) +
        Math.abs(target.y - p.lookY) +
        Math.abs(target.x * 0.85 - p.turnX) +
        Math.abs(target.y * 0.5 - p.turnY) <
      0.02
    );
  }

  /** Milliseconds until the driver will move on its own: the next blink or glance. */
  nextWake(now: number): number {
    /* The idle glance only starts once the pointer has been still for 2.6 s, so a
       `nextIdle` already in the past must wait for that too, or a face somebody just
       moved past would poll every frame until then. */
    return Math.max(16, Math.min(this.nextBlink, Math.max(this.nextIdle, this.aimAt + 2601)) - now);
  }

  /**
   * The part of body space the canvas covers right now: the look's own frame, or a blend
   * from the last one while an accessory goes on or comes off.
   */
  private currentFrame(now: number): MascotFrame {
    const to = mascotFrame(this.look);
    const from = this.reframe.from;
    if (!from || this.still) return to;
    const r = Math.min(1, (now - this.reframe.at) / MORPH_MS);
    if (r >= 1) {
      this.reframe.from = null;
      return to;
    }
    const k = easeInOut(r);
    return { left: from.left + (to.left - from.left) * k, top: from.top + (to.top - from.top) * k, span: from.span + (to.span - from.span) * k };
  }

  frame(now: number): { look: MascotLook; pose: MascotPose; frame: MascotFrame } {
    const p = this.pose;
    if (this.still) {
      return { look: this.look, pose: { ...STILL_POSE }, frame: mascotFrame(this.look) };
    }
    const t = now / 1000;

    // Breath: a slow, small squash, never in step with the blink.
    const breath = Math.sin(t * 2.1);
    let sx = 1 - breath * 0.012;
    let sy = 1 + breath * 0.018;
    let lift = 0;

    // Hop: crouch, rise, land. The crouch is short so a click feels answered at once.
    const h = (now - this.hopAt) / HOP_MS;
    if (h >= 0 && h < 1) {
      const k = this.hopSize;
      if (h < 0.16) {
        const c = Math.sin((h / 0.16) * Math.PI);
        sy -= 0.09 * k * c;
        sx += 0.07 * k * c;
      } else if (h < 0.82) {
        const a = (h - 0.16) / 0.66;
        lift = Math.sin(a * Math.PI) * 0.2 * k;
        sy += Math.sin(a * Math.PI) * 0.05 * k * (1 - a);
        sx -= Math.sin(a * Math.PI) * 0.035 * k * (1 - a);
      } else {
        const c = Math.sin(((h - 0.82) / 0.18) * Math.PI);
        sy -= 0.06 * k * c;
        sx += 0.05 * k * c;
      }
    }

    // Blink, on a schedule with the odd double; eyes swap at the shut point.
    if (now >= this.nextBlink) {
      this.blinkAt = now;
      const double = Math.random() < 0.18;
      this.nextBlink = now + (double ? 260 : 2200 + Math.random() * 3200);
    }
    const b = (now - this.blinkAt) / BLINK_MS;
    let blink = 0;
    if (b >= 0 && b < 1) {
      blink = Math.sin(b * Math.PI);
      if (b >= 0.5 && this.shownEyes !== this.look.eyes) this.shownEyes = this.look.eyes;
    } else if (this.shownEyes !== this.look.eyes) {
      this.shownEyes = this.look.eyes;
    }

    // Gaze: the pointer while it moves, a wander once it has been still a while.
    const sinceAim = now - this.aimAt;
    if (sinceAim > 2600 && now >= this.nextIdle) {
      const glances = [
        { x: STILL_POSE.lookX, y: STILL_POSE.lookY },
        { x: -0.7, y: 0.2 },
        { x: 0.6, y: -0.3 },
        { x: 0, y: 0.6 },
        { x: -0.2, y: -0.5 },
      ];
      this.idleAim = glances[Math.floor(Math.random() * glances.length)];
      this.nextIdle = now + 1400 + Math.random() * 2600;
    }
    const target = sinceAim > 2600 ? this.idleAim : this.aim;
    const follow = 0.16;
    p.lookX += (target.x - p.lookX) * follow;
    p.lookY += (target.y - p.lookY) * follow;
    // The face turns more slowly than the eyes, which is what makes it read as a head.
    p.turnX += (target.x * 0.85 - p.turnX) * 0.07;
    p.turnY += (target.y * 0.5 - p.turnY) * 0.07;

    // A lean toward where it is looking, and into the hop.
    const tilt = -p.turnX * 0.05;

    const m = this.morph.from ? Math.min(1, (now - this.morph.at) / MORPH_MS) : 1;
    if (m >= 1) this.morph.from = null;
    const d = this.dissolve.from ? Math.min(1, (now - this.dissolve.at) / DISSOLVE_MS) : 1;
    if (d >= 1) this.dissolve.from = null;

    const glee = now < this.gleeUntil;
    /* The drop lands with a cubic ease-out: fast off the top, settling onto the head. */
    const dp = (now - this.dropAt) / DROP_MS;
    const drop = dp >= 0 && dp < 1 ? DROP_FROM * Math.pow(1 - dp, 3) : 0;
    return {
      frame: this.currentFrame(now),
      look: { ...this.look, eyes: glee ? "happy" : this.shownEyes },
      pose: {
        lookX: p.lookX,
        lookY: p.lookY,
        turnX: p.turnX,
        turnY: p.turnY,
        blink,
        squashX: sx,
        squashY: sy,
        lift,
        tilt,
        wobble: t,
        fromShape: this.morph.from,
        morph: easeInOut(m),
        fromColor: this.dissolve.from,
        dissolve: easeOut(d),
        drop,
      },
    };
  }
}
