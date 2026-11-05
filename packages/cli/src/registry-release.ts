import { createHash, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { EnvHttpProxyAgent, fetch } from "undici";
import { LIMITS } from "@opengame/shared";
import { CliError } from "./output";

export const CLI_REGISTRY = "https://registry.npmjs.org";
export const CLI_PACKAGE = "@opengamehq/cli";
export const REGISTRY_RELEASE = /^@opengamehq\/cli@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$(?![\s\S])/;

const CAPS = LIMITS.platform.cliUpgrade;
const invalid = () => new CliError("upgrade_untrusted", "The CLI release could not be verified against the official npm registry. Nothing was installed.", 5);

export function registryMetadata(value: unknown, spec: string): { tarball: string; integrity: string; version: string } {
  if (!REGISTRY_RELEASE.test(spec) || !value || typeof value !== "object") throw invalid();
  const version = spec.slice(CLI_PACKAGE.length + 1);
  const data = value as { name?: unknown; version?: unknown; dist?: { tarball?: unknown; integrity?: unknown } };
  const integrity = data.dist?.integrity;
  // Require one canonical SHA-512 digest. We do not fall back to npm's legacy SHA-1.
  if (data.name !== CLI_PACKAGE || data.version !== version || typeof integrity !== "string" ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)) throw invalid();
  const tarball = `${CLI_REGISTRY}/${CLI_PACKAGE}/-/cli-${version}.tgz`;
  if (data.dist?.tarball !== tarball) throw invalid();
  return { tarball, integrity, version };
}

/** Verify the same bytes that npm will install, including the package inside them.
 * The CLI is bundled and needs no install scripts or runtime dependency downloads. */
export function verifyCliArchive(bytes: Buffer, release: { integrity: string; version: string }): void {
  if (bytes.length > CAPS.archiveBytesMax || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(release.integrity)) throw invalid();
  const expected = Buffer.from(release.integrity.slice(7), "base64");
  const actual = createHash("sha512").update(bytes).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid();
  try {
    const tar = gunzipSync(bytes, { maxOutputLength: CAPS.unpackedBytesMax });
    let metadata: Record<string, unknown> | undefined;
    for (let offset = 0; offset + 512 <= tar.length;) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every(byte => byte === 0)) break;
      const text = (start: number, length: number) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
      const name = [text(345, 155), text(0, 100)].filter(Boolean).join("/");
      const sizeText = text(124, 12).trim();
      if (!/^[0-7]+$/.test(sizeText) || !name.startsWith("package/") || name.includes("\\") || name.includes("//") ||
        name.split("/").some(part => part === "." || part === "..") || !["", "0", "5"].includes(text(156, 1))) throw invalid();
      const size = parseInt(sizeText, 8);
      const start = offset + 512;
      if (!Number.isSafeInteger(size) || start + size > tar.length) throw invalid();
      if (name === "package/package.json") {
        if (metadata || size > CAPS.metadataBytesMax || !["", "0"].includes(text(156, 1))) throw invalid();
        metadata = JSON.parse(tar.subarray(start, start + size).toString("utf8"));
      }
      offset = start + Math.ceil(size / 512) * 512;
    }
    if (!metadata || metadata.name !== CLI_PACKAGE || metadata.version !== release.version ||
      Object.keys((metadata.dependencies ?? {}) as object).length || Object.keys((metadata.optionalDependencies ?? {}) as object).length ||
      Object.keys((metadata.peerDependencies ?? {}) as object).length ||
      metadata.bundledDependencies || metadata.bundleDependencies) throw invalid();
    const bin = metadata.bin as Record<string, unknown> | undefined;
    if (!bin || Object.keys(bin).length !== 1 || !["dist/cli.mjs", "./dist/cli.mjs"].includes(String(bin.opengame))) throw invalid();
  } catch { throw invalid(); }
}

export async function downloadRegistryRelease(spec: string): Promise<Buffer> {
  if (!REGISTRY_RELEASE.test(spec)) throw invalid();
  const dispatcher = new EnvHttpProxyAgent();
  try {
    const read = async (url: string, maximum: number) => {
      const response = await fetch(url, { dispatcher, redirect: "error", signal: AbortSignal.timeout(CAPS.requestTimeoutMs), headers: { accept: "application/json" } });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw invalid(); }
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > maximum) throw invalid();
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks, length);
    };
    const version = spec.slice(CLI_PACKAGE.length + 1);
    const metadata = registryMetadata(JSON.parse((await read(`${CLI_REGISTRY}/@opengamehq%2fcli/${version}`, CAPS.metadataBytesMax)).toString("utf8")), spec);
    const archive = await read(metadata.tarball, CAPS.archiveBytesMax);
    verifyCliArchive(archive, metadata);
    return archive;
  } catch { throw invalid(); }
  finally { await dispatcher.close(); }
}
