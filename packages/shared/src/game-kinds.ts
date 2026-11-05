/**
 * The four kinds, typed.
 *
 * Every upload on OpenGame is exactly one of these, and every surface that asks for,
 * filters on or shows a kind reads them from here: the CLI's `init`, the manifest schema,
 * the submit wizard, the gallery rail, game pages and cards, search, the jam and the review
 * console. Settled on 26 Oct 2026.
 *
 * `game` is the default, and it is the one kind nothing badges. A gallery where every card
 * says "Game" says nothing at all; the label earns its place only on the cards that are
 * something else, which is also what keeps a world or a mod from being mistaken for a game
 * that is missing its goal.
 *
 * The values live in `game-kinds.json` for the reason `genres.ts` gives: one file that
 * Python could read too. Today it does not; the pipeline matches the two strings it uses
 * itself (apps/pipeline/opengame_pipeline/playtest_agent.py). The database holds the same four as the `game_kind`
 * enum, and `tests/game-kinds.test.ts` fails if the migration and this file disagree.
 */

import raw from "../game-kinds.json" with { type: "json" };
import { countCharacters, gameNameCharacterProblem, textLimit } from "./limits-browser";

export const GAME_KIND_SLUGS = ["game", "world", "decomp", "mod"] as const;

export type GameKind = (typeof GAME_KIND_SLUGS)[number];

/** What every upload is until somebody says otherwise, and every game made before kinds. */
export const DEFAULT_GAME_KIND: GameKind = "game";

export interface GameKindInfo {
  slug: GameKind;
  /** Sentence case, singular: "World". */
  label: string;
  /** Sentence case, plural, for a filter or a heading: "Worlds". */
  plural: string;
  /** The one line under the name in a picker. No full stop, so it sits in a row. */
  help: string;
  /** Made from somebody else's game, so it has to say which. */
  basedOn: boolean;
  /** The question that asks which game, for the two kinds with `basedOn`. */
  basedOnPrompt?: string;
  /** Whether the jam takes it. */
  jam: boolean;
}

export const GAME_KINDS = raw.kinds as GameKindInfo[];

/* The literal list exists so the type is a union rather than `string`, and the JSON is the
   list other readers would take. Compared once at load rather than trusted, as genres.ts does. */
if (GAME_KINDS.map((k) => k.slug).join() !== GAME_KIND_SLUGS.join()) {
  throw new Error("packages/shared/game-kinds.json and GAME_KIND_SLUGS disagree about the four kinds.");
}

const BY_SLUG = new Map<string, GameKindInfo>(GAME_KINDS.map((k) => [k.slug, k]));

export function isGameKind(value: unknown): value is GameKind {
  return typeof value === "string" && BY_SLUG.has(value);
}

export function gameKind(slug: GameKind): GameKindInfo;
export function gameKind(slug: string | null | undefined): GameKindInfo | null;
export function gameKind(slug: string | null | undefined): GameKindInfo | null {
  return (slug && BY_SLUG.get(slug)) || null;
}

/**
 * What a stored or sent kind means. A row written before kinds existed, an older CLI that
 * never sends one and a manifest that leaves it out are all games, which is the backfill
 * stated as a function rather than as a migration somebody has to remember. Anything that
 * is not one of the four is refused by `parseGameKind`, not folded into a game: a typo of
 * `mod` quietly listed as a game is how a mod escapes the review it should get.
 */
export function gameKindOrDefault(value: string | null | undefined): GameKind {
  return isGameKind(value) ? value : DEFAULT_GAME_KIND;
}

/** Whether a kind is made from another game, and so must name it. */
export function kindNeedsBasedOn(kind: GameKind): boolean {
  return BY_SLUG.get(kind)!.basedOn;
}

/** Whether the jam takes a kind. */
export function kindEntersJam(kind: GameKind): boolean {
  return BY_SLUG.get(kind)!.jam;
}

/**
 * The label a card or a page shows, or null for a game. See the top of this file for why
 * the default goes unbadged.
 */
export function kindBadge(kind: string | null | undefined): string | null {
  const info = gameKind(gameKindOrDefault(kind));
  return info && info.slug !== DEFAULT_GAME_KIND ? info.label : null;
}

/**
 * "Mod of Doom", "Decomp of Super Mario 64": the line a game page and a card set under the
 * title for the two kinds made from another game, or null when there is nothing to say.
 */
export function basedOnLine(kind: string | null | undefined, basedOn: string | null | undefined): string | null {
  const info = gameKind(gameKindOrDefault(kind));
  const name = basedOn?.trim();
  if (!info || !info.basedOn || !name) return null;
  return `${info.label} of ${name}`;
}

/**
 * A kind as it sits inside a sentence: "a game", "a world", "a mod of Doom", "a decomp of
 * Super Mario 64". Lowercase with its article, because the labels are title-case for chips
 * and "relabels Decomp of OutRun as Game" is what joining them into prose produced in the
 * console. A stored value nobody recognises reads as a game, as everywhere else. One
 * wording for the CLI's deploy line and the console's relabel copy alike.
 */
export function kindPhrase(kind: string | null | undefined, basedOn?: string | null): string {
  const info = gameKind(gameKindOrDefault(kind))!;
  const name = basedOn?.trim();
  return `a ${info.label.toLowerCase()}${info.basedOn && name ? ` of ${name}` : ""}`;
}

/** Why a claim was refused, so a caller can say it once: the manifest's text() already
 *  reports a too-long name, so it skips `length` and keeps the rest. */
export type KindProblem = "kind" | "type" | "not_allowed" | "required" | "characters" | "unnamed" | "length";

export type ParsedKind =
  | { ok: true; kind: GameKind; basedOn: string | null }
  | { ok: false; field: "kind" | "basedOn"; code: KindProblem; message: string };

/**
 * Characters a reader cannot see, beyond the controls, format, private-use and unassigned
 * code points gameNameCharacterProblem already refuses: every default-ignorable code point
 * (variation selectors, Hangul fillers, the combining grapheme joiner, the unassigned ones
 * too) and the braille blank. private.game_kind_claim and private.reason_is_blank write the
 * same class out by code point.
 */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Default_Ignorable_Code_Point}\u2800]/gu;
const HAS_LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

/**
 * Why a source name cannot stand, or null. A zero-width space passed as the required source,
 * and a page read "Mod of " and nothing (review R32); U+2065 and a Hangul filler did the same
 * after that (R32b). So: none of the hidden characters above, nothing gameNameCharacterProblem
 * refuses, and at least one letter or number, so the name names something.
 */
export function sourceCharacterProblem(name: string): Extract<KindProblem, "characters" | "unnamed"> | null {
  if (gameNameCharacterProblem(name) || new RegExp(HIDDEN.source, "u").test(name)) return "characters";
  if (!HAS_LETTER_OR_NUMBER.test(name)) return "unnamed";
  return null;
}

/**
 * One reading of a kind and the game it is based on, for every place that takes them from
 * a person or a program: the CLI's manifest check, the web routes, the wizard. Two readers
 * of one field is the shape AGENTS.md opens with, and the weaker one always ends up on the
 * surface nobody re-reads.
 *
 * Absent kind is a game. A based-on name is required for a decomp or a mod, refused for a
 * game or a world (a world that names a game is either a mod or a claim it does not need
 * to make), trimmed, held to sourceCharacterProblem, and capped by
 * `limits.text.gameBasedOn`, counted in code points as limits.json requires.
 */
export function parseGameKind(kind: unknown, basedOn: unknown): ParsedKind {
  const maxBasedOn = textLimit("gameBasedOn").max;
  if (kind !== undefined && kind !== null && !isGameKind(kind)) {
    return { ok: false, field: "kind", code: "kind", message: `kind must be one of ${GAME_KIND_SLUGS.join(", ")}.` };
  }
  const resolved = gameKindOrDefault(kind as string | null | undefined);
  const info = BY_SLUG.get(resolved)!;
  if (basedOn !== undefined && basedOn !== null && typeof basedOn !== "string") {
    return { ok: false, field: "basedOn", code: "type", message: "basedOn must be the name of a game." };
  }
  const name = typeof basedOn === "string" ? basedOn.trim().replace(/\s+/g, " ") : "";
  if (!info.basedOn) {
    if (name) {
      return { ok: false, field: "basedOn", code: "not_allowed",
        message: "basedOn is only for a decomp or a mod. Remove it, or set kind to decomp or mod." };
    }
    return { ok: true, kind: resolved, basedOn: null };
  }
  if (!name) {
    return { ok: false, field: "basedOn", code: "required",
      message: `A ${info.label.toLowerCase()} must say which game it is based on. Set basedOn to that game's name.` };
  }
  const characters = sourceCharacterProblem(name);
  if (characters === "characters") {
    return { ok: false, field: "basedOn", code: "characters", message: "basedOn can only use letters, numbers, spaces and punctuation." };
  }
  if (characters === "unnamed") {
    return { ok: false, field: "basedOn", code: "unnamed", message: "basedOn must name the game, with at least one letter or number." };
  }
  if (countCharacters(name) > maxBasedOn) {
    return { ok: false, field: "basedOn", code: "length", message: `basedOn can be up to ${maxBasedOn} characters.` };
  }
  return { ok: true, kind: resolved, basedOn: name };
}

/**
 * Whether a reason a reviewer typed says nothing: no letter or number is left once the hidden
 * characters are taken out. Whitespace, a zero-width space (review R32), a Hangul filler, the
 * braille blank or a lone combining mark (R32b) are each blank. private.reason_is_blank is the
 * same rule in SQL, which is the enforcement; this lets the console say so before the press.
 */
export function reasonIsBlank(value: string | null | undefined): boolean {
  return !HAS_LETTER_OR_NUMBER.test((value ?? "").replace(HIDDEN, ""));
}
