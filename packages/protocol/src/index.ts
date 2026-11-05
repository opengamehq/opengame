import type { RepairFinding } from "./findings";

export * from "./manifest";
export * from "./release";
export * from "./engine";
export * from "./authority";
export * from "./status";
export * from "./catalog";
export * from "./findings";
export * from "./errors";
export * from "./jam-form";
export * from "./submission";
export * from "./review";
export * from "./scorecard";
export * from "./analytics";

export const EXIT = {
  ok: 0, check: 1, input: 2, auth: 3, rateLimited: 4, server: 5, upgrade: 6, notLaunched: 7,
} as const;

export type CliEvent =
  | { type: "progress"; stage: string; message: string; operation?: string; bytes?: number; total?: number; files?: number; totalFiles?: number; elapsedMs?: number; limits?: unknown }
  | { type: "notice"; code: string; message: string; paths?: string[]; url?: string; userCode?: string; expiresAt?: string; dependencies?: Record<string, unknown>[]; allowance?: Record<string, unknown> }
  | { type: "finding"; finding: RepairFinding }
  | { type: "result"; command: string; data: unknown }
  | { type: "error"; code: string; message: string; exitCode: number; finding?: RepairFinding;
      /** Additive. Present when waiting is the fix; with exit 4 it is the wait the server asked for. */
      retry?: RepairFinding["retry"]; retryAfterSeconds?: number; next?: string };
export * from "./token-management";
export * from "./incremental-upload";
export * from "./archive-parts";
export * from "./deploy-source";

export * from "./bootstrap";

export { studioExperimentSchema, studioExperimentRefusals, type StudioExperimentRefusal } from "./experiments";
