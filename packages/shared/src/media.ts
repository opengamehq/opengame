/**
 * Which media kinds may be served from a public bucket, and which may not.
 *
 * This exists because of a specific mistake, made on 31 Aug 2026 and corrected the same
 * hour. `promoteMedia` was written to copy a game's art out of og-quarantine into
 * og-public on approval -- the half of publishing that had never existed -- and it was
 * given every `game_media` row for the game. That set includes `submission_video`, which
 * is the recording a creator makes FOR THE JUDGES: `specs.ts` says "the judges watch this
 * first", and the public game view in `catalogue.ts` deliberately never selects it. Three
 * of them were made publicly readable on media.opengame.gg by a backfill, and removed
 * again once the originals in quarantine were confirmed intact.
 *
 * The lesson is not "filter the list at the call site". It is that "which media is
 * public" was a question three files answered independently -- the public view by
 * selecting kinds, the console by not rendering it, and the promoter by not asking -- and
 * the one that decides what bytes a stranger can fetch was the one that never asked. So
 * the answer lives here, in the package both applications already read, and it is an
 * allowlist: a media kind added to the schema is private until somebody says otherwise,
 * which is the direction this mistake would have wanted.
 *
 * Kept in step with `media_kind` in the schema by `PUBLIC_MEDIA_KINDS`'s type, which is
 * the generated enum -- so a kind renamed in a migration stops compiling here.
 */
import type { Enums } from "@opengame/db";

/**
 * Served from og-public, at media.opengame.gg, to anyone with the URL.
 *
 * Every one of these appears on a published game's own page, which is the test for
 * membership: if a stranger can already see it by visiting the game, serving the bytes
 * from a public bucket tells them nothing new.
 */
export const PUBLIC_MEDIA_KINDS = [
  "cover",
  "thumbnail",
  "og_image",
  "screenshot",
  "gameplay_video",
  "clip",
  /* The sandbox's recording of a game's own menu screen, playing. Public because it leads
     the strip on the game's page (`galleryStills`), which is this list's test -- but only
     once a reviewer has watched it and accepted it: the sandbox writes it `processing`,
     and `publicMediaKeys` will not promote it until the console's accept makes it
     `ready`. Added
     30 Sep 2026 with `20260930120000_media_kind_menu_loop.sql`; the anon read policy in
     `20260930120100_anon_reads_menu_loop.sql` names it too, and the two must move
     together or the row is promoted and never shown, or shown and never promoted. */
  "menu_loop",
] as const satisfies readonly Enums<"media_kind">[];

/**
 * Everything else, named rather than implied.
 *
 * A list of what is excluded is worth the duplication: `PUBLIC_MEDIA_KINDS` alone says
 * what happens to a kind nobody thought about, but it does not say that anybody thought
 * about this one. `submission_video` is a deliberate exclusion with a reason, and the
 * test below pins that the two lists together cover the enum exactly, so a kind added to
 * the schema fails a test rather than quietly defaulting.
 */
export const PRIVATE_MEDIA_KINDS = [
  "submission_video",
] as const satisfies readonly Enums<"media_kind">[];

const PUBLIC = new Set<string>(PUBLIC_MEDIA_KINDS);

/** Whether these bytes may live in og-public. */
export function isPublicMediaKind(kind: string): boolean {
  return PUBLIC.has(kind);
}

/** Legacy game-wide art remains usable; a revision only supplies its own media. */
export function mediaMatchesVersion(
  media: { version_id: string | null },
  versionId: string | null,
): boolean {
  return media.version_id === null || (typeof versionId === "string" && media.version_id === versionId);
}
