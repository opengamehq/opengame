/**
 * What a person reads while Studio works, derived from what is actually happening.
 *
 * Before this file there were four phrase tables for one run: the run header's chip, the
 * island's current-activity row, the empty preview's heading and a fixed "Starting your
 * game" under the first prompt. Each was right about the states its author looked at and
 * silent or wrong about the rest, and the page cycled none of them, so a sandbox that took
 * ninety seconds to boot read as one frozen sentence. This is the one table. The web
 * page and the island both call it, which is why it lives in `packages/shared` and takes
 * plain facts rather than either app's state shape.
 *
 * THE RULE IS THAT EVERY PHRASE IS TRUE. A signal nobody passed says nothing, an empty
 * list is an honest answer, and nothing is padded with encouragement to keep the shimmer
 * moving. The caller cycles through what comes back, most specific first; a page that
 * wants one line takes the first.
 *
 * The island's own tool descriptions ("Generating an image", the retry counter) are more
 * specific than anything here and win while a tool is running. This covers the time
 * around them, which on a first prompt is most of the first two minutes.
 *
 * There was briefly a second table (`studio-activity.ts`) with its own word for each
 * phase. It is folded in here as `studioPhasePhrase`, which is what both surfaces fall
 * back to when nothing more specific is known.
 */

/** How long one status phrase holds before the next: one sweep of the shimmer, which
 * both stylesheets run at this duration (`studio-rotating-text.css`, `island.css`). */
export const STUDIO_STATUS_CYCLE_MS = 2400;

export type StudioSendStep = "preparing" | "saving" | "uploading" | "admitting" | "opening";

/** Everything is optional. Pass what you know; what you leave out is not described. */
export interface StudioProgressSignals {
  /** The browser's own steps between pressing send and the session page, before any run. */
  send?: { step: StudioSendStep; done?: number; total?: number } | null;
  /** The Worker's `run.state`. */
  runState?: string | null;
  /** Stop requested and not yet acknowledged. Outranks everything, because it is what the person asked for. */
  stopping?: boolean;
  /** Finish up requested: the run is wrapping up and releasing what exists. */
  finishing?: boolean;
  sandbox?: "none" | "starting" | "up" | "unavailable" | null;
  /** The agent's native session exists. */
  agentSession?: boolean;
  /** The run's first prompt reached the agent. */
  admitted?: boolean;
  /** A saved conversation was carried into this run. */
  historyRestored?: boolean;
  /** The source checkpoint for the current run. */
  source?: "capturing" | "writing" | "ready" | "failed" | "superseded" | null;
  concept?: { state: string; ready: number; total: number } | null;
  /** This run began when the creator picked concept art (not "use my prompt"). Its prompt
   * names that art as the visual target, and its workspace, which is always a fresh one
   * because a concept is chosen before the session's first build, copies the pictures in
   * while it starts. Pass it only for that run: a later run neither restates nor re-copies. */
  conceptChosen?: boolean;
  pendingAssets?: { image?: number; model?: number; audio?: number; video?: number } | null;
  /** The automatic gameplay review is pending or admitted. */
  reviewing?: boolean;
  /** The list is for the island's activity row, where the agent's own tool rows, subagent
   * tasks and review line already say building, reviewing and generating. Leave those out
   * so only what the island cannot see remains. */
  agentSpeaks?: boolean;
}

/**
 * The one word for each state in which the Worker, not the agent, is doing the work, or
 * undefined. Building is deliberately absent: while the agent builds, its own tools,
 * tasks and retries are the words.
 */
export function studioPhasePhrase(state: string | null | undefined): string | undefined {
  switch (state) {
    case "concept": return "Drawing concept art";
    case "starting": return "Preparing the game workspace";
    case "stopping": return "Stopping game work";
    case "quiescing":
    case "extracting": return "Packaging the game files";
    case "scanning": return "Checking the game’s safety";
    case "measuring": return "Playtesting the game";
    case "recording": return "Recording the game preview";
    default: return undefined;
  }
}

/** The run states in which the Worker, not the agent, is doing the work. Concept art is
 * excluded because its choices render in the conversation rather than on the status line. */
export function studioSupervisedPhase(state: string | null | undefined): boolean {
  return state !== "concept" && studioPhasePhrase(state) !== undefined;
}

const BUILDING = "Building the game";

function sendPhrase(send: NonNullable<StudioProgressSignals["send"]>): string {
  switch (send.step) {
    case "preparing": return "Preparing your images";
    case "saving": return "Saving your prompt";
    case "uploading":
      return send.total && send.total > 1 ? `Uploading image ${Math.min((send.done ?? 0) + 1, send.total)} of ${send.total}` : "Uploading your image";
    case "admitting": return "Asking Studio to start";
    case "opening": return "Opening your session";
  }
}

function conceptPhrase(concept: StudioProgressSignals["concept"]): string {
  if (!concept || concept.total <= 0) return "Reading your idea";
  if (concept.state === "ready" || concept.state === "selected" || concept.ready >= concept.total) return "Concept art ready";
  if (concept.ready === 0) return "Concept art requested";
  return `Concept art ${concept.ready} of ${concept.total} ready`;
}

const CONCEPT_TARGET = "Concept art set as the visual target";
const AGENT_WAITS = "The agent starts when the workspace is up";

/**
 * The workspace comes up in a fixed order, so the first missing step is the current one
 * and leads. What follows it is what is also true at that step: a step already finished,
 * or a plain statement about the phase itself. A first run after concept art has spent
 * nine minutes here, and one frozen sentence for that long reads as nothing happening, so
 * each step has a second true thing to say. None of them is a step the page cannot see:
 * "reading your brief" would be a guess until the agent says something, and the agent's
 * own rows take over the moment it does.
 */
function startingPhrases(s: StudioProgressSignals): string[] {
  if (s.sandbox === undefined || s.sandbox === null) return [studioPhasePhrase("starting")!];
  if (s.sandbox === "unavailable") return ["Reconnecting to the workspace"];
  const concept = s.conceptChosen ? [CONCEPT_TARGET] : [];
  if (s.sandbox === "none") return ["Requesting a workspace", "Each game builds in a private workspace", ...concept];
  // The pipeline fetches the chosen pictures and places them while it builds the sandbox,
  // which is the whole of the Worker's "starting".
  if (s.sandbox === "starting") return ["Starting the workspace", ...(s.conceptChosen ? ["Copying your concept art into the workspace"] : []), AGENT_WAITS];
  if (!s.agentSession) return ["Starting the agent", "Workspace ready", ...concept];
  if (!s.admitted) return ["Sending your prompt to the agent", "Agent started", ...(concept.length ? concept : ["Workspace ready"])];
  return ["Agent started"];
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("{n}", String(n)));

function assetPhrases(pending: StudioProgressSignals["pendingAssets"]): string[] {
  const out: string[] = [];
  if (!pending) return out;
  if (pending.image) out.push(plural(pending.image, "Generating an image", "Generating {n} images"));
  if (pending.model) out.push(plural(pending.model, "Building a 3D model", "Building {n} 3D models"));
  if (pending.audio) out.push(plural(pending.audio, "Making a sound", "Making {n} sounds"));
  if (pending.video) out.push(plural(pending.video, "Animating a video", "Animating {n} videos"));
  return out;
}

/** Every phrase that is true now, most specific first, without repeats. */
export function studioProgressPhrases(s: StudioProgressSignals): string[] {
  if (s.stopping) return [studioPhasePhrase("stopping")!];
  const out: string[] = [];
  if (s.finishing) out.push("Finishing up");
  if (s.send) out.push(sendPhrase(s.send));
  const state = s.runState ?? null;
  if (state === "concept") out.push(conceptPhrase(s.concept));
  else if (state === "starting") out.push(...startingPhrases(s));
  else if (state === "building" || state === "landing") {
    // A run is "building" from admission, before the agent has read anything. Say which.
    if (!s.admitted) out.push(...startingPhrases(s));
    if (!s.agentSpeaks) {
      if (s.reviewing) out.push("Reviewing the game");
      out.push(BUILDING);
    }
  } else {
    const phrase = studioPhasePhrase(state);
    if (phrase) out.push(phrase);
  }
  if (s.historyRestored && (state === "starting" || ((state === "building" || state === "landing") && !s.admitted))) out.push("Conversation restored");
  if (s.source === "capturing" || s.source === "writing") out.push("Saving your game files");
  if (!s.agentSpeaks) out.push(...assetPhrases(s.pendingAssets));
  return [...new Set(out)];
}

/** The most specific true phrase, or null when there is nothing honest to say. */
export function studioProgressPhrase(s: StudioProgressSignals): string | null {
  return studioProgressPhrases(s)[0] ?? null;
}
