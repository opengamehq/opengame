import { setTimeout as sleep } from "node:timers/promises";
import { archivePartBytes, archivePartsSchema, archivePartUploadSchema, type ArchiveParts } from "@opengame/protocol";
import { LIMITS } from "@opengame/shared";
import { Api, UploadInterrupted } from "./http";
import { retryShortly } from "./incremental";
import { CliError, type Output } from "./output";

/**
 * Sends an archive to storage in parts, for a deploy the server answered with `multipart`
 * rather than `upload` (the server's multipart route holds the other half).
 *
 * The server chose the part size and says which parts it already holds, so a second run of
 * `opengame deploy` resumes with the parts the first did not finish: the saved deploy's key
 * gets the same operation back, and its descriptor lists what landed. Nothing about the
 * upload is kept on this machine beyond what was already kept for a single PUT.
 *
 * Parts go concurrency at a time (limits.json, platform.deploy.multipart). Each is signed
 * right before it is sent, so a URL is never older than one part's transfer, and a part
 * that fails is signed again and resent, up to uploadAttemptsMax times. The first part that
 * runs out of tries stops the others taking new parts, and the ones in flight finish before
 * the failure is reported, so nothing is still sending after the command says it stopped.
 *
 * Returns "uploaded" when every part is in storage (or the object already is), and "left"
 * when the operation stopped uploading under it; the caller confirms either way, which is
 * what reports the operation's real state.
 */
export async function uploadArchiveParts(api: Api, token: string, operation: string, bytes: Uint8Array, descriptor: unknown,
  output: Output): Promise<"uploaded" | "left"> {
  let parts = readParts(descriptor, bytes);
  const startedAt = Date.now();
  const tries = LIMITS.platform.deploy.uploadAttemptsMax;
  // A confirmation that finds parts missing (a race, or storage that lost an answer) gets
  // one more pass over what the server says is still missing, then reports what it said.
  for (let pass = 1; ; pass++) {
    const done = new Set(parts.uploadedParts);
    const queue = Array.from({ length: parts.partCount }, (_, index) => index + 1).filter(part => !done.has(part));
    const inFlight = new Map<number, number>();
    let landed = parts.uploadedParts.reduce((sum, part) => sum + archivePartBytes(parts.byteSize, parts.partBytes, part), 0);
    let shown = -1;
    const report = () => {
      const sent = landed + [...inFlight.values()].reduce((sum, value) => sum + value, 0);
      const percent = Math.floor(sent / parts.byteSize * 100);
      if (percent === shown || (percent % 10 !== 0 && output.json)) return;
      shown = percent;
      output.emit({ type: "progress", stage: "upload", operation, message: `Sending archive: ${sent} of ${parts.byteSize} bytes`,
        bytes: sent, total: parts.byteSize, elapsedMs: Date.now() - startedAt });
    };
    report();
    let next = 0, failed = false, left = false;
    const send = async (part: number) => {
      const size = archivePartBytes(parts.byteSize, parts.partBytes, part);
      const offset = (part - 1) * parts.partBytes;
      // A copy is not needed: put() streams subarrays of this view and never keeps it.
      const slice = bytes.subarray(offset, offset + size);
      for (let attempt = 1; ; attempt++) {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const signed = await retryShortly(output, () => sign(api, token, operation, part, size));
        if (signed === "left") { left = true; return; }
        try {
          // react-doctor-disable-next-line react-doctor/async-await-in-loop
          await api.uploadPart(signed, slice, sent => { inFlight.set(part, sent); report(); });
          inFlight.delete(part);
          landed += size;
          report();
          return;
        } catch (error) {
          inFlight.delete(part);
          if (!(error instanceof UploadInterrupted)) throw error;
          /* 404 is storage no longer knowing the upload: it was completed by another run, or
             discarded. Re-signing would name the same upload again, so the server is asked
             what it holds instead; an upload it discarded comes back as upload_expired, which
             starts a new deploy, and one that completed is done. */
          if (error.cause === "storage answered 404") {
            // react-doctor-disable-next-line react-doctor/async-await-in-loop
            const state = await retryShortly(output, () => api.json(`/api/v1/operations/${operation}/upload`, { token, method: "POST" }));
            if (state.uploaded === true || !state.multipart) { left = true; return; }
          }
          if (attempt >= tries) throw error;
          output.emit({ type: "notice", code: "upload_retrying", message: `Part ${part} of ${parts.partCount} was interrupted (${error.cause}). Trying again, ${attempt + 1} of ${tries}.` });
          // react-doctor-disable-next-line react-doctor/async-await-in-loop
          await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)));
        }
      }
    };
    const worker = async () => {
      while (!failed && !left && next < queue.length) {
        try { await send(queue[next++]!); } catch (error) { failed = true; throw error; }
      }
    };
    const settled = await Promise.allSettled(Array.from({ length: Math.min(LIMITS.platform.deploy.multipart.concurrency, queue.length) }, worker));
    const rejected = settled.find(result => result.status === "rejected") as PromiseRejectedResult | undefined;
    if (rejected) {
      const error = rejected.reason;
      if (error instanceof UploadInterrupted) {
        throw new CliError("upload_interrupted", `The upload did not finish after ${tries} tries of one part; the last time ${error.cause}. Your game is fine and the parts already sent are kept. Check your connection, then run opengame deploy to resume the same operation.`, 5, { next: "opengame deploy", retry: "later" });
      }
      throw error;
    }
    if (left) return "left";
    // Every part was sent. Ask once more what the server holds, so a part storage did not
    // keep is sent again here rather than discovered by the confirmation.
    const fresh = await retryShortly(output, () => api.json(`/api/v1/operations/${operation}/upload`, { token, method: "POST" }));
    if (fresh.uploaded === true || !fresh.multipart) return fresh.uploaded === true ? "uploaded" : "left";
    parts = readParts(fresh.multipart, bytes);
    if (parts.uploadedParts.length === parts.partCount) return "uploaded";
    if (pass >= 2) {
      throw new CliError("upload_interrupted", `${parts.partCount - parts.uploadedParts.length} of ${parts.partCount} parts did not stay in storage. Run opengame deploy to resume the same operation.`, 5, { next: "opengame deploy", retry: "later" });
    }
  }
}

/** The descriptor, held to the archive this machine is about to cut. A server that
 * describes a different archive is not followed. */
function readParts(value: unknown, bytes: Uint8Array): ArchiveParts {
  const parsed = archivePartsSchema.safeParse(value);
  if (!parsed.success || parsed.data.byteSize !== bytes.byteLength) {
    throw new CliError("invalid_upload", "The server returned an invalid upload. Run opengame deploy again.", 5);
  }
  return parsed.data;
}

/** One part's signed URL, checked against the part this machine meant to send. */
async function sign(api: Api, token: string, operation: string, part: number, size: number) {
  const answer = await api.json(`/api/v1/operations/${operation}/upload/parts`, { token, method: "POST", body: { parts: [part] } });
  const list = Array.isArray(answer.parts) ? answer.parts : null;
  // An operation that left uploading (expired, or confirmed by another run) signs nothing.
  if (list && list.length === 0) return "left" as const;
  const signed = archivePartUploadSchema.safeParse(list?.[0]);
  if (!list || list.length !== 1 || !signed.success || signed.data.partNumber !== part || signed.data.headers["content-length"] !== String(size)) {
    throw new CliError("invalid_upload", "The server returned an invalid upload. Run opengame deploy again.", 5);
  }
  return signed.data;
}
