import { z } from "./zod";
import { engineMetadataSchema, buildMetadataSchema } from "./engine";
import { METADATA_FIELDS } from "./manifest";
import { LIMITS } from "@opengame/shared/browser";
import { CHECK_PROGRESS_STATES, operationStageSchema, repairFindingSchema } from "./findings";
import { submissionSchema } from "./submission";

export const gameCursorSchema = z.uuid();
export const gameIdentifierSchema = z.union([z.uuid(), z.string().regex(/^[0-9a-z]{6,16}$/)]);
export const operationSummarySchema = z.object({
  id: z.uuid(),
  engine: engineMetadataSchema.nullable().optional(),
  build: buildMetadataSchema.nullable().optional(),
  state: z.enum(["uploading", "queued", "checking", "ready", "failed", "expired"]),
  gameId: z.uuid().nullable(),
  releaseId: z.uuid().nullable(),
  error: z.string().nullable(),
  /** Opaque change cursor: present only when this server supports bounded status waits. */
  waitCursor: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  // The check a pending deploy is waiting on (scan, images, text-policy). Progress only.
  stage: z.string().regex(/^[a-z][a-z-]{1,40}$/).optional(),
  /* "cover" is no longer a metadata field, and a server from before 30 Oct 2026 can still
     name it here. Refusing it would fail the whole status read over a line of feedback,
     and repeating it would send the creator to a pull that brings no cover down, so it is
     dropped on the way in. The schema published from this one names only the real fields. */
  metadata: z.object({ revision: z.number().int().positive(),
    keptFields: z.preprocess(value => Array.isArray(value) ? value.filter(key => key !== "cover") : value,
      z.array(z.enum(METADATA_FIELDS)).max(METADATA_FIELDS.length)),
    source: z.enum(["local", "server"]).optional() }).optional(),
  // Additive: older servers omit these, and the CLI falls back to the upload page.
  publicId: z.string().regex(/^[0-9a-z]{6,16}$/).nullable().optional(),
  /** The owner-only playable page, `/g/<publicId>`, once the release is ready. */
  previewUrl: z.string().nullable().optional(),
  /** Where the published game runs, `https://<label>.opengame.gg`: one origin per game, the
   * same for every version, and the value a creator's own server has to allow when it checks
   * `Origin` or sends CORS headers. A private preview plays on a temporary origin of its own, so
   * this is not the preview's. Additive: older servers omit it. The pattern is the schema's
   * label (`games_host_label_format`) under any domain without a port, because a development
   * server can serve games from somewhere other than opengame.gg. `.catch`: when this copy
   * cannot read the value, it drops the origin line and the status read still succeeds. */
  gameOrigin: z.string().regex(/^https:\/\/[0-9a-z]{8,24}(\.[a-z0-9-]+)+$/).nullable().optional().catch(undefined),
  // `stage` above is the raw check the deploy waits on. `progress` is the same
  // thing said for a person: whose move it is and whether the fault is ours.
  progress: operationStageSchema.optional(),
  /** Selected check receipts, shared with the deployment page. Older servers omit them. */
  checks: z.array(z.object({ check: z.string(), label: z.string(), state: z.enum(CHECK_PROGRESS_STATES) })).optional(),
  findings: z.array(repairFindingSchema).max(40).optional(),
  /** The exact command that moves this operation forward, when there is one. */
  next: z.string().nullable().optional(),
  /** Why this deploy will not enter the jam, when the jam is where new games go and that is
   * already known (its kind, the creator's entry limit, the jam's window): said at upload, so
   * the creator hears it before review runs rather than at the details step after it. The
   * deploy still goes to review and may be published to the marketplace. Additive: absent
   * when it enters the jam, when the marketplace is the destination, and from older servers. */
  jamNotice: z.object({ code: z.string().regex(/^[a-z_]{1,40}$/), message: z.string().min(1).max(600) }).optional(),
}).refine(value => value.state !== "ready" || Boolean(value.gameId && value.releaseId));
export type OperationSummary = z.infer<typeof operationSummarySchema>;

/** Where the game's published release stands. Additive: older servers omit it. */
export const publicationSchema = z.object({
  state: z.enum(["publishing", "published"]),
  releaseId: z.uuid(),
  /** The public game page, the address to share once it is published. */
  url: z.url(),
  /** False while platform games are unlisted: playable by link, on no gallery. */
  listed: z.boolean(),
});
export type Publication = z.infer<typeof publicationSchema>;

export const creatorGameSchema = z.object({
  engine: engineMetadataSchema.nullable().optional(),
  build: buildMetadataSchema.nullable().optional(),
  id: z.uuid(), publicId: z.string().regex(/^[0-9a-z]{6,16}$/), title: z.string().min(1),
  visibility: z.string().min(1),
  latestOperation: operationSummarySchema.nullable(),
  publication: publicationSchema.nullable().default(null),
  /** Where the game stands, in the one vocabulary every creator surface uses: the key of
   * its RELEASE_STATUS entry (a string, so a key newer than this copy still parses), its
   * label and sentence. Additive: older servers omit it, and the CLI then names the game
   * from its newest deploy as before. */
  status: z.object({ key: z.string().min(1), label: z.string().min(1), message: z.string().min(1) }).optional(),
  /** The game's newest standing submission, on a single-game read with read or submit
   * access. What `opengame status` reports review from. Additive. */
  // .catch: a submission state newer than this copy costs the review line, not every
  // command that reads a game.
  submission: submissionSchema.nullable().optional().catch(undefined),
}).refine(value => !value.latestOperation || value.latestOperation.gameId === value.id);
export type CreatorGame = z.infer<typeof creatorGameSchema>;
export const creatorGamesPageSchema = z.object({
  games: z.array(creatorGameSchema).max(LIMITS.platform.operations.listPageSize),
  nextCursor: z.uuid().nullable(),
});

/** The owner's page for a game is the game page itself, `/g/<publicId>`, which
 * plays the newest ready release under its status strip and links to the upload.
 * Only an upload still in flight is better followed on the upload page. */
export function creatorGamePath(game: CreatorGame): string {
  const operation = game.latestOperation;
  return operation && ["uploading", "queued", "checking"].includes(operation.state) ? deploymentPath(operation.id) : `/g/${game.publicId}`;
}

/**
 * A deploy's own page, which exists from the moment the deploy does. The preview's
 * address needs the game and the release, and a first deploy has neither until the
 * archive is in and checked, so this is the address `opengame deploy` prints before it
 * returns. It says what is being checked, why anything failed, and offers Play once
 * the release is ready.
 */
export function deploymentPath(operationId: string): string {
  return `/settings/deployments/${encodeURIComponent(operationId)}`;
}
/** Every deploy of one game, newest first. */
export function gameDeploymentsPath(publicId: string): string {
  return `/settings/games/${encodeURIComponent(publicId)}/deployments`;
}

/**
 * One row of `GET /api/v1/games/<id>/deployments` and of `opengame deployments`: a
 * deploy as the list shows it. `reason` is the leading finding's own sentence and fix
 * for a deploy that did not end ready, so the list says why without opening each one.
 * Additive only, like every platform shape.
 */
export const deploymentSchema = z.object({
  id: z.uuid(),
  state: operationSummarySchema.shape.state,
  /** The same label the deploy's chip carries everywhere else. */
  label: z.string().min(1),
  createdAt: z.string(),
  /** When it reached ready, failed or expired. Null while it is still running. */
  endedAt: z.string().nullable(),
  releaseId: z.uuid().nullable(),
  byteSize: z.number().int().nonnegative().nullable(),
  fileCount: z.number().int().nonnegative().nullable(),
  /** Who started it: the agent token's name, or null for a browser session or a token since deleted. */
  by: z.string().nullable(),
  reason: z.object({ observed: z.string().min(1), fix: z.string().min(1) }).nullable(),
  url: z.string(),
  /** Null also when the availability read failed, which the API cannot tell apart from a
   * hold for the caller; the deploy's own page says which (review of #662). */
  previewUrl: z.string().nullable().meta({ description: "The owner-only playable page for this release. `null` for a deploy that is not ready, and for a ready one with no preview to offer: a hold, a take-down or cleaned files, or an availability check that could not be read this time." }),
});
export type Deployment = z.infer<typeof deploymentSchema>;
export const gameDeploymentsSchema = z.object({
  // A bound on what a client will parse, not the page size, which is the server's to pick.
  deployments: z.array(deploymentSchema).max(100),
});

/** Every release of one game, newest first: what `opengame releases` lists. */
export function gameReleasesApiPath(gameId: string): string {
  return `/api/v1/games/${encodeURIComponent(gameId)}/releases`;
}
/** Make one release of the game live again: what `opengame rollback` sends. */
export function gameRollbackApiPath(gameId: string, releaseId: string): string {
  return `${gameReleasesApiPath(gameId)}/${encodeURIComponent(releaseId)}/rollback`;
}

/**
 * One row of `GET /api/v1/games/<id>/releases`: a release as the Releases tab on the game
 * workspace lists it, from the same read (`readReleases`), named in the one status
 * vocabulary. `status` is a key of RELEASE_STATUS and `label` its words; the CLI prints the
 * label, so a status added later still reads. `rollback` is true where the tab offers
 * "Make live again": the game is live, and this release was live before and still has its
 * files. It is an offer, not a permission; the rollback itself is checked again.
 * Additive only, like every platform shape.
 */
export const gameReleaseSchema = z.object({
  id: z.uuid(),
  /** The first eight characters, the way the website, the strip and the emails print it. */
  short: z.string().min(1),
  /** The published version this release made, or null for one that never became a version. */
  versionId: z.uuid().nullable(),
  createdAt: z.string(),
  /** The title its manifest carried, as the release list shows it. */
  title: z.string(),
  status: z.string().min(1),
  label: z.string().min(1),
  live: z.boolean(),
  newest: z.boolean(),
  /** Its files were cleaned up by retention: history only, never playable or live again. */
  cleaned: z.boolean(),
  /** Passed every preview check, so it plays on the private page. */
  ready: z.boolean(),
  rollback: z.boolean(),
});
export type GameRelease = z.infer<typeof gameReleaseSchema>;
export const gameReleasesSchema = z.object({
  gameId: z.uuid(),
  publicId: z.string().min(1),
  /** Whether the game is live on OpenGame now. Nothing can be rolled back while it is not. */
  live: z.boolean(),
  /** Why no release can be made live right now (a publication is on its way), or null. */
  rollbackBlocked: z.string().nullable(),
  // A bound on what a client will parse, not the page size, which is the server's to pick.
  releases: z.array(gameReleaseSchema).max(100),
});

/** `POST /api/v1/games/<id>/releases/<releaseId>/rollback`: what was made live. */
export const gameRollbackSchema = z.object({
  gameId: z.uuid(),
  publicId: z.string().min(1),
  releaseId: z.uuid(),
  versionId: z.uuid(),
  /** False when that release was already the live one; its address is written again either way. */
  swapped: z.boolean(),
  /** The game's public address, which serves this release from players' next load. */
  url: z.string(),
});

/** Take a game off the gallery, or put it back: what `opengame unpublish` and `opengame
 * restore` send. The website's Unpublish and Put it back, through the same functions. */
export function gameTakeDownApiPath(gameId: string, act: "unpublish" | "restore"): string {
  return `/api/v1/games/${encodeURIComponent(gameId)}/${act}`;
}
/** Delete a game for good: what `opengame delete` sends, with the title typed out. */
export function gameDeleteApiPath(gameId: string): string {
  return `/api/v1/games/${encodeURIComponent(gameId)}/delete`;
}
export const gameDeleteRequestSchema = z.strictObject({ title: z.string().min(1).max(1024) });
/** What `POST /api/v1/games/<id>/unpublish`, `.../restore` and `.../delete` answer once the act is done. */
export const gameTakeDownSchema = z.object({
  gameId: z.uuid(),
  publicId: z.string().min(1),
  /** Where the game now stands on the gallery: `removed` after a delete. */
  visibility: z.enum(["unpublished", "published", "removed"]),
  /** A put back that found the game already listed and wrote only its address. */
  repaired: z.boolean(),
  /** The game came down, and some of its art may still be public: staff finish it. */
  artPending: z.boolean(),
  /** The game's page in the creator's settings. */
  url: z.string(),
  /** What happened, in the website's own words for the same press. */
  message: z.string(),
});

/** A game's title, tagline and description on the website: what `opengame details` sends.
 * The Details tab on the game's page, through the same function. */
export function gameDetailsApiPath(gameId: string): string {
  return `/api/v1/games/${encodeURIComponent(gameId)}/details`;
}
/** The body of `PATCH /api/v1/games/<id>/details`: any of the three, and the rest stay as
 * they are. The server holds each to the website's own limits. */
export const gameDetailsRequestSchema = z.strictObject({
  title: z.string().max(4096).optional(),
  tagline: z.string().max(4096).optional(),
  description: z.string().max(65536).optional(),
}).refine(body => body.title !== undefined || body.tagline !== undefined || body.description !== undefined, "Send a title, a tagline or a description.");
/** What the website now shows for the game, once saved. */
export const gameDetailsSchema = z.object({
  gameId: z.uuid(),
  publicId: z.string().min(1),
  /** The game is published, so the change is public now (and recorded with both sides). */
  live: z.boolean(),
  /** The metadata revision the save moved to, which the next deploy from an older folder reads. */
  revision: z.number().int().nullable(),
  title: z.string(),
  tagline: z.string().nullable(),
  description: z.string(),
  url: z.string(),
});

/** Rename the account's handle: what `opengame handle <name>` sends. */
export const ACCOUNT_HANDLE_API_PATH = "/api/v1/account/handle";
export const accountHandleRequestSchema = z.strictObject({ handle: z.string().max(256) });
export const accountHandleSchema = z.object({
  handle: z.string().min(1),
  /** The handle it replaced, which is now free for anyone to claim. */
  previous: z.string().nullable(),
  url: z.string(),
});

/** Withdraw a game's jam entry, or put a withdrawn one back: what `opengame jam withdraw`
 * and `opengame jam reenter` send. /jam/entries' own Withdraw and Re-enter. */
export function gameJamEntryApiPath(gameId: string, act: "withdraw" | "reenter"): string {
  return `/api/v1/games/${encodeURIComponent(gameId)}/jam-entry/${act}`;
}
export const gameJamEntrySchema = z.object({
  gameId: z.uuid(),
  publicId: z.string().min(1),
  /** The entry that moved: the one standing in the jam, or the newest withdrawn one. */
  entryId: z.string().min(1),
  /** Whether it is in the jam now. */
  entered: z.boolean(),
  url: z.string(),
  message: z.string(),
});


export const gameMetadataSnapshotSchema = z.object({
  gameId: z.uuid(), revision: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()),
  controllerSupport: z.boolean(), compatibility: z.record(z.string(), z.unknown()),
  // Always null from a server since 30 Oct 2026, which no longer hands a cover to a pull.
  // Still read as an object or null, because a CLI can be pointed at an older server.
  cover: z.object({ path: z.string() }).nullable(),
});

/** What `opengame upgrade` may install: an HTTPS tarball or an exact registry
 * version, and no character a shell would act on, because the CLI hands the
 * value to npm (through cmd on Windows). The server and the CLI both check it. */
export const CLI_PACKAGE_PATTERN = /^(?:https:\/\/[A-Za-z0-9._~:/@+=-]+\.tgz|@opengamehq\/cli@\d+\.\d+\.\d+)$/;
