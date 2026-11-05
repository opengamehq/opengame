/**
 * The curated games a decomp or a mod is made from, typed. The owner's call of 4 Nov 2026
 * (launch plan, "Games pages", work item 4): "a curated list of source games with Other; tags
 * people search by". The list and why it is shaped this way are in `source-games.json`.
 *
 * The database does the resolving, from a seeded copy of the same rows (`public.source_games`),
 * because a game's `based_on` is written by four paths (a release's manifest at publish, the
 * console's kind correction, Studio, a remix) and a trigger is the one place all four pass.
 * This file holds the same rule for the places that ask before anything is written: the CLI's
 * `init`, which lists the games to pick from, and the tests that keep the two copies equal.
 */

import raw from "../source-games.json" with { type: "json" };
import { LIMITS, countCharacters } from "./limits-browser";

export interface SourceGame {
  slug: string;
  /** The game's own title, as its publisher writes it. */
  name: string;
  /** The other ways of writing this one game. With `name`, the only words that resolve. */
  aliases: readonly string[];
  /** Lowercase words a person would type to find it, series and platform included. Search
   * only: a tag resolves nothing, because "zelda" is not one game. */
  tags: readonly string[];
}

/** The slug of a source that is not on the list. Its name is the creator's own words. */
export const OTHER_SOURCE_GAME = raw.other;

export const SOURCE_GAMES: readonly SourceGame[] = raw.games;

/** How a typed name is compared: case, spacing and the marks people leave off are not a
 * difference ("pokemon emerald" is Pokémon Emerald, "Doom  II" is Doom II). */
export function sourceGameKey(text: string): string {
  /* The combining-accent block, not every mark: it is the range the database drops
     (`private.source_game_key`), and the two have to agree on every key. */
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const BY_KEY = new Map<string, SourceGame>();
for (const game of SOURCE_GAMES) {
  for (const key of [game.name, ...game.aliases].map(sourceGameKey)) BY_KEY.set(key, game);
}

/**
 * The curated game a typed name means, by its title or one of its aliases, or null for
 * anything else. Never by a tag: tags were the resolving set until the code review of 5 Nov
 * 2026 typed "Zelda" and got Ocarina of Time, "valve" and got Half-Life, "cs" and got
 * Counter-Strike, so a Breath of the Wild mod would have gone live as a mod of a game it is
 * not. An alias means one game, and the test refuses two games sharing one.
 */
export function sourceGameFor(basedOn: string | null | undefined): SourceGame | null {
  if (!basedOn) return null;
  return BY_KEY.get(sourceGameKey(basedOn)) ?? null;
}

/**
 * The tags a game made from `basedOn` is found by: its source's, or for a source not on the
 * list, its own name in lowercase. Capped by `catalogue.searchTagsMax` and
 * `catalogue.searchTagCharsMax`, which the database checks too.
 */
export function searchTagsFor(basedOn: string | null | undefined): string[] {
  if (!basedOn?.trim()) return [];
  const source = sourceGameFor(basedOn);
  const tags = source ? [...source.tags] : [basedOn.trim().toLowerCase().replace(/\s+/g, " ")];
  const max = LIMITS.catalogue.searchTagCharsMax;
  return [...new Set(tags.filter((tag) => countCharacters(tag) <= max))].slice(0, LIMITS.catalogue.searchTagsMax);
}
