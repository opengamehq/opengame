import { operationSummarySchema, type OperationSummary } from "@opengame/protocol";
import { Api } from "./http";
import { CliError } from "./output";
import { updateProject, type Project } from "./project";

type Operation = OperationSummary;
export function operation(value: unknown, expected?: string): Operation {
  const parsed = operationSummarySchema.safeParse(value);
  if (!parsed.success || (expected && parsed.data.id !== expected)) throw new CliError("invalid_response", "The server returned an incomplete operation. Run opengame status to retry.", 5);
  return parsed.data;
}
export const terminal = (op: Operation) => ["ready", "failed", "expired"].includes(op.state);

/** Record the server’s operation; unchanged polls leave the project file alone. */
export function remember(op: Operation, state: Project): boolean {
  if (!state.deploy || state.deploy.operationId !== undefined && state.deploy.operationId !== op.id) return false;
  let changed = false;
  const ended = terminal(op);
  if (state.deploy.operationId !== op.id || state.deploy.terminal !== ended) { state.deploy.operationId = op.id; state.deploy.terminal = ended; changed = true; }
  // Past uploading, the saved request has nothing left to resume: its bytes are
  // with the server. A later plain deploy uploads the folder as it is now.
  if (op.state !== "uploading" && !state.deploy.uploaded) { state.deploy.uploaded = true; changed = true; }
  if (op.gameId && state.gameId !== op.gameId) {
    // A different game means a different metadata history.
    if (state.gameId) delete state.metadataRevision;
    state.gameId = op.gameId; changed = true;
  }
  // REL-5: a release that carries this checkout's own metadata means the checkout
  // is in sync at that revision. Without adopting it, every later deploy was
  // stale by construction and quietly kept the first deploy's title.
  const metadata = op.metadata;
  const local = metadata && (metadata.source === "local" || (metadata.source === undefined && metadata.keptFields.length === 0));
  if (local && op.gameId && state.gameId === op.gameId && metadata.revision > (state.metadataRevision ?? 0)) {
    state.metadataRevision = metadata.revision; changed = true;
  }
  return changed;
}


/** Resolve the saved deploy before a command needs the game created by that deploy.
 * Reads work beside an upload; a busy writer will save the same operation itself. */
export async function readSavedOperation(api: Api, token: string, root: string, state: Project): Promise<Operation | null> {
  const id = state.deploy?.operationId;
  if (!id) return null;
  const op = operation((await api.json(`/api/v1/operations/${id}`, { token })).operation, id);
  await updateProject(root, api.origin, current => remember(op, current));
  remember(op, state);
  return op;
}
