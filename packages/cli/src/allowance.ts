import { allowanceMeterSchema, utcInstant, type AllowanceMeter } from "@opengame/protocol";
import { Api } from "./http";
import { activeToken } from "./credentials";
import { readBootstrap } from "./bootstrap";
import { CliError, type Output } from "./output";
import { readableBytes } from "./bytes";

export type AccountAllowance = Record<string, AllowanceMeter & { remaining: number | null }>;
export function accountAllowance(value: unknown): AccountAllowance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([name, item]) => {
    const parsed = allowanceMeterSchema.safeParse(item);
    if (!parsed.success) return [];
    const row = parsed.data;
    return [[name, { ...row, remaining: row.max === null ? null : Math.max(0, row.max - row.used) }]];
  }));
}

// deploysPerDay is today's daily meter (20261105180200); scanBytesPerDay is the one it
// replaced, kept so a CLI still reads a server from before it.
const labels: Record<string, string> = { deploysPerHour: "Deploys this hour", deploysPerDay: "Deploys in the last 24 hours", scanBytesPerDay: "Uploads scanned in the last 24 hours",
  heldBytes: "Storage", submissionsPerDay: "Submissions today (UTC)", playtestsPerDay: "Playtests in the last 24 hours", activeEntries: "Active jam entries" };

/* The two byte meters printed as 5368709120 of 5368709120 on the first walk a person
   took through this command (14 Oct 2026), and the reset as a raw ISO stamp. The JSON
   result keeps the exact numbers; only the sentence a person reads is rounded. */
const byteMeters = new Set(["heldBytes", "scanBytesPerDay"]);

export function allowanceLines(allowance: AccountAllowance): string[] {
  return Object.entries(allowance).map(([name, row]) => {
    const label = name === "activeEntries" && row.jamName ? `Active entries in ${row.jamName}` : labels[name] ?? name;
    const amount = byteMeters.has(name) ? readableBytes : (n: number) => String(n);
    if (row.max === null) return `${label}: ${amount(row.used)} used`;
    return `${label}: ${amount(row.remaining ?? 0)} of ${amount(row.max)} left${row.resetsAt ? `, more from ${utcInstant(row.resetsAt)}` : ""}`;
  });
}

/** The bundle half of "bundle limits and your allowance", which the human output left out. */
export function bundleLine(bundle: unknown): string | null {
  const { archiveBytesMax, fileCountMax, uncompressedBytesMax } = (bundle ?? {}) as Record<string, unknown>;
  if (typeof archiveBytesMax !== "number" || typeof fileCountMax !== "number") return null;
  const unpacked = typeof uncompressedBytesMax === "number" ? `, ${readableBytes(uncompressedBytesMax)} unpacked` : "";
  return `Each build: up to ${readableBytes(archiveBytesMax)} uploaded${unpacked}, ${fileCountMax} files`;
}

export async function showAllowance(api: Api, token: string, output: Output) {
  // Older servers and temporary usage outages must not hide an operation's result.
  const data = await readBootstrap(api, token, "limits").catch(() => null);
  const allowance = accountAllowance(data?.usage);
  if (!Object.keys(allowance).length) return;
  output.emit({ type: "notice", code: "account_allowance", allowance,
    message: `Account usage: ${allowanceLines(allowance).join("; ")}.` });
}

export async function limitsCommand(flags: Record<string, string | boolean>, output: Output) {
  const api = new Api();
  try {
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login to read your current allowance.", 3, { next: "opengame login" });
    api.tokenSource = active.source;
    const data = await readBootstrap(api, active.token, "limits");
    const allowance = accountAllowance(data.usage);
    output.emit({ type: "result", command: "limits", data: { bundle: data.bundle, allowance,
      message: [bundleLine(data.bundle), ...(Object.keys(allowance).length ? allowanceLines(allowance) : ["Your account allowance was not in the server's answer, so only the build limits are shown."])]
        .filter(Boolean).join("\n") } });
  } finally { await api.close(); }
}
