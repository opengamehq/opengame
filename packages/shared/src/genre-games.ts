import raw from "../genre-games.json" with { type: "json" };
import { GENRE_SLUGS, type GenreSlug } from "./genres";
import { STUDIO } from "./limits-browser";

/**
 * The games a player picks from in Help me get started. genre-games.json has why it
 * exists; the page, the site's route and the Worker's writer all read it from here, so
 * the list a person chose from is the list their choice is checked against.
 */

export interface GenreGame {
  title: string;
  /** First release year, or a one-word tag. */
  note: string;
  /** Other genres a player would plainly look for it under. It is listed once, under the
   * genre it sits in, and shown under these as well (`gamesIn`). */
  alsoIn?: GenreSlug[];
}

export const GENRE_GAMES = raw.genres as Record<GenreSlug, GenreGame[]>;

/** Every game on every list with the genre it is listed under, in genre order: the
 * wizard's table and the check on a pick both read this one list. */
export const EVERY_GAME: readonly { game: GenreGame; genre: GenreSlug }[] =
  GENRE_SLUGS.flatMap((genre) => GENRE_GAMES[genre].map((game) => ({ game, genre })));

/**
 * What browsing one genre shows: the games listed under it, then the ones from other
 * genres that name it in `alsoIn`, each once and each with the genre it is listed under.
 * Unsorted; the page puts them A to Z.
 */
export function gamesIn(genre: GenreSlug): { game: GenreGame; genre: GenreSlug }[] {
  return EVERY_GAME.filter((row) => row.genre === genre || row.game.alsoIn?.includes(genre));
}

/**
 * The picks, if every one is on some genre's list, none repeats, and there are no more
 * than `likedMax` (limits.json `studio.promptHelp`).
 *
 * Checked against every list rather than the chosen genre's, because the wizard keeps a
 * creator's picks when they change genre (a person who likes Halo and then chooses
 * Racing still likes Halo), and each title is listed under one genre only, so a title
 * names one game wherever it was ticked.
 *
 * The cap is there because every pick is text in a platform-paid call: without it a
 * request could carry all 280 titles, several times the input the model is priced at.
 */
export function readLikedGames(value: unknown): GenreGame[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > STUDIO.promptHelp.likedMax || value.some((item) => typeof item !== "string")) return null;
  const picked = (value as string[]).map((title) => EVERY_GAME.find((row) => row.game.title === title)?.game);
  if (picked.some((game) => !game) || new Set(value).size !== value.length) return null;
  return picked as GenreGame[];
}

/**
 * The creator's one note, trimmed, or null when it is too long or not text. A string
 * since the wizard became one dialog. The object with a note per step, `{ genre, games }`,
 * is what the first version's page sent, and a tab left open on it still does, so it is
 * read the same way with its parts joined rather than refused with an error the creator
 * cannot act on. The site's route and the Worker both read notes through this.
 */
export function readWizardNote(value: unknown): string | null {
  const one = (note: unknown) => note === undefined ? "" : typeof note === "string" && note.trim().length <= STUDIO.promptHelp.notesCharsMax ? note.trim() : null;
  if (typeof value !== "object" || value === null) return one(value);
  if (Array.isArray(value)) return null;
  // Those two keys and no others: every part is paid-for text in the writer's call, and an
  // object of any shape would let a request carry any number of full-length notes.
  if (Object.keys(value).some((key) => key !== "genre" && key !== "games")) return null;
  const parts = Object.values(value).map(one);
  return parts.includes(null) ? null : parts.filter(Boolean).join(" / ");
}
