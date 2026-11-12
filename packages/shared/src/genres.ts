/**
 * The ten genres, typed.
 *
 * Every game on OpenGame carries exactly one of these, and every surface that offers,
 * filters on or shows a genre reads them from here: Studio, the submit wizard, the jam,
 * the gallery, game pages and the review console. The list was settled on 26 Sep 2026.
 *
 * The values live in `genres.json` for the reason `limits.ts` gives about `limits.json`:
 * one file that TypeScript and Python both read, with no build step between them. The
 * database holds the same ten as `taxonomy_terms`, written by
 * `supabase/migrations/20260926120000_ten_top_level_genres.sql`, and
 * `tests/genres.test.ts` fails if that file and this one disagree. A picker still takes a
 * term's uuid from the database, because that is what a game row points at; it takes the
 * list, the order, the names and the help text from here.
 */

import raw from "../genres.json" with { type: "json" };

export interface Genre {
  /** Stable id: the URL, `taxonomy_terms.slug`, `jam_tracks.key`. */
  slug: GenreSlug;
  /** Sentence case, as a person reads it. */
  label: string;
  /** What falls under it, for help text. */
  includes: string[];
  /** Words that suggest it. See `inferGenre`. */
  cues: string[];
  /** Its curated second level, in the order a picker offers them. See `Subgenre`. */
  subgenres: Subgenre[];
}

/**
 * One genre's second level: Horror under Shooter & survival, Monster collecting under RPG.
 * The owner's call, 11 Nov 2026: every game also says what it is within its genre, detected by review
 * and confirmed or changed by its creator. Optional on a game, where the genre never is.
 *
 * The database holds these as active children of their genre in `taxonomy_terms`
 * (20261112060000_subgenres.sql), and `tests/genres.test.ts` holds the two to one list. A
 * slug is unique across all ten genres, so a subgenre names its genre without being told.
 */
export interface Subgenre {
  slug: string;
  /** Sentence case, as a card's badge prints it. */
  label: string;
}

export const GENRE_SLUGS = [
  "shooter-survival",
  "action-adventure",
  "rpg",
  "platformer",
  "strategy",
  "simulation-management",
  "racing-sports",
  "fighting",
  "puzzle-casual",
  "party-social-sandbox",
] as const;

export type GenreSlug = (typeof GENRE_SLUGS)[number];

export const GENRES = raw.genres as Genre[];

/* The literal list above exists so the type is a union rather than `string`. If the JSON
   and the literal ever differ, every lookup below would be quietly wrong, so they are
   compared once at load rather than trusted. */
if (GENRES.map((g) => g.slug).join() !== GENRE_SLUGS.join()) {
  throw new Error("packages/shared/genres.json and GENRE_SLUGS disagree about the ten genres.");
}

const BY_SLUG = new Map<string, Genre>(GENRES.map((g) => [g.slug, g]));
const LEGACY = raw.legacy as Record<string, GenreSlug>;

/* Each subgenre slug, with the genre it sits under. A slug claimed twice, or one that is also
   a genre's, would make a subgenre name two places, so that is refused at load like the list
   above rather than discovered as a badge under the wrong genre. */
const SUBGENRE_OF = new Map<string, { genre: GenreSlug; label: string }>();
for (const genre of GENRES) {
  for (const sub of genre.subgenres ?? []) {
    if (SUBGENRE_OF.has(sub.slug) || BY_SLUG.has(sub.slug)) {
      throw new Error(`packages/shared/genres.json names the subgenre ${sub.slug} twice.`);
    }
    SUBGENRE_OF.set(sub.slug, { genre: genre.slug, label: sub.label });
  }
}

/** A genre's subgenres, in order, or none for a slug that is not one of the ten. */
export function subgenresOf(genre: string): Subgenre[] {
  return BY_SLUG.get(genre)?.subgenres ?? [];
}

/** What a card prints for a subgenre slug, or null for one that is not on the list. */
export function subgenreLabel(slug: string): string | null {
  return SUBGENRE_OF.get(slug)?.label ?? null;
}

/** The genre a subgenre sits under, or null for a slug that is not a subgenre. */
export function genreOfSubgenre(slug: string): GenreSlug | null {
  return SUBGENRE_OF.get(slug)?.genre ?? null;
}

/** Whether `subgenre` is one of `genre`'s own: the one pairing a game may carry. */
export function isSubgenreOf(genre: string, subgenre: string): boolean {
  return SUBGENRE_OF.get(subgenre)?.genre === genre;
}

export function isGenreSlug(value: unknown): value is GenreSlug {
  return typeof value === "string" && BY_SLUG.has(value);
}

export function genreBySlug(slug: string): Genre | null {
  return BY_SLUG.get(slug) ?? null;
}

export function genreLabel(slug: string): string | null {
  return BY_SLUG.get(slug)?.label ?? null;
}

/**
 * What falls under a genre, as one line of help: "FPS, TPS, battle royale, ...". The jam's
 * track blurbs are this line too, and `tests/genres.test.ts` holds them to it.
 */
export function genreHelp(slug: string): string | null {
  const text = BY_SLUG.get(slug)?.includes.join(", ");
  return text ? text[0]!.toUpperCase() + text.slice(1) : null;
}

/**
 * The genre a slug means now: itself for one of the ten, the genre it was folded into for
 * a slug the taxonomy used before 26 Sep 2026, null for anything else. So a gallery link
 * sent last week to `?genre=shooter` still lands on Shooter & survival.
 */
export function currentGenre(slug: string): GenreSlug | null {
  if (isGenreSlug(slug)) return slug;
  /* `hasOwn`, because a slug is somebody's typing and "constructor" would otherwise hand
     back Object's own function typed as a genre. */
  return Object.hasOwn(LEGACY, slug) ? LEGACY[slug]! : null;
}

/** Lowercase, apostrophes dropped, every other run of punctuation one space. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The genre a game's own words point at, or null when they do not point clearly.
 *
 * Each genre scores one for every distinct cue found as whole words, and only a clear
 * winner is returned. A tie returns null, because a wrong default gets submitted without
 * anybody reading it and an empty field is one the creator fills. No model call: this
 * reads what the game already says about itself, which for Studio is the title, the
 * description, the concept the creator chose and their first prompt.
 */
export function inferGenre(evidence: string): GenreSlug | null {
  const words = ` ${normalize(evidence)} `;
  if (words.trim() === "") return null;
  const scored = GENRES.map((genre) => ({
    slug: genre.slug,
    score: new Set(genre.cues.filter((cue) => words.includes(` ${normalize(cue)} `))).size,
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return null;
  return scored[0]!.slug;
}
