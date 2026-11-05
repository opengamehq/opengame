import { z } from "./zod";
import { engineMetadataSchema, buildMetadataSchema } from "./engine";
import { METADATA_FIELDS } from "./manifest";
import { LIMITS } from "@opengame/shared/browser";
import { operationStageSchema, repairFindingSchema } from "./findings";
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
  // `stage` above is the raw check the deploy waits on. `progress` is the same
  // thing said for a person: whose move it is and whether the fault is ours.
  progress: operationStageSchema.optional(),
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
