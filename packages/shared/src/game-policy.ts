import limits from "../limits.browser.json";

/**
 * What a game may not do, read from `gamePolicy` in limits.json.
 *
 * The network opened on 26 Oct 2026: a game on an `openNetwork` contract may call an AI
 * model, a third-party API, its own multiplayer server or a script CDN. What stays closed
 * is payments, crypto, sign-up walls, ads and ad tracking, and a Content-Security-Policy
 * cannot say any of that -- it can only list what to allow. So the closed half is
 * enforced by the checks instead: the preflight that `opengame check`, the jam wizard and
 * the server's platform scan share, the jam scan in `content.py`, the sandbox run's `net`
 * verdict, and the page that opens a game's links. Every one of them reads this module or
 * its Python twin in `apps/pipeline/opengame_pipeline/limits.py`, so the sentence a
 * creator reads at `opengame check` and the refusal a reviewer sees cannot disagree.
 *
 * The list catches the common shapes, not the rule. The rule is the sentence in
 * `categories`, which the terms state and a person checks by playing the game.
 */

export type PolicyCategory = "payments" | "crypto" | "accounts" | "ads" | "tracking";
export type PolicySeverity = "blocker" | "warning";

export interface PolicyCategoryText {
  label: string;
  /** One or two sentences a creator can act on. Shown verbatim by every checker. */
  rule: string;
}

export interface BlockedService {
  /** How a finding names it: "Stripe", "a crypto wallet". */
  name: string;
  category: PolicyCategory;
  /** Each matches itself and every subdomain of itself. */
  hosts: readonly string[];
  patterns: readonly { pattern: string; flags: string; severity: PolicySeverity }[];
}

export interface PolicyHit {
  service: string;
  category: PolicyCategory;
  severity: PolicySeverity;
  /** Offset of the match in the text, for a line number. The matched text is not kept. */
  index: number;
}

export interface ReviewSignalHit {
  label: string;
  category: PolicyCategory;
  index: number;
}

export interface BlockedPackageGroup {
  /** How a finding names it, the same names `blockedServices` uses where they overlap. */
  name: string;
  category: PolicyCategory;
  severity: PolicySeverity;
  /** npm names. One ending in `/` is a scope and matches every package in it. */
  packages: readonly string[];
}

export interface PackageHit {
  service: string;
  category: PolicyCategory;
  severity: PolicySeverity;
  /** The npm name read out of the URL, lowercased: `@stripe/stripe-js`. */
  package: string;
}

interface RawPolicy {
  categories: Record<PolicyCategory, PolicyCategoryText>;
  blockedServices: BlockedService[];
  packageCdnHosts: string[];
  blockedPackages: BlockedPackageGroup[];
  reviewSignals: { label: string; category: PolicyCategory; pattern: string; flags: string }[];
}

const policy = (limits as unknown as { gamePolicy: RawPolicy }).gamePolicy;

export const POLICY_CATEGORIES: Readonly<Record<PolicyCategory, PolicyCategoryText>> = policy.categories;
export const BLOCKED_SERVICES: readonly BlockedService[] = policy.blockedServices;
export const PACKAGE_CDN_HOSTS: readonly string[] = policy.packageCdnHosts;
export const BLOCKED_PACKAGES: readonly BlockedPackageGroup[] = policy.blockedPackages;

/* Compiled once. `g` is added here rather than stored, because a stored flag would be a
   second thing for the Python side to strip, and `lastIndex` state belongs to a matchAll
   call rather than to the table. */
const compiled = BLOCKED_SERVICES.flatMap((service) =>
  service.patterns.map((p) => ({ service, severity: p.severity, re: new RegExp(p.pattern, `${p.flags}g`) })),
);
const signals = policy.reviewSignals.map((s) => ({ ...s, re: new RegExp(s.pattern, `${s.flags}g`) }));

/** The blocked service a hostname belongs to, or null. `pay.stripe.com` is Stripe. */
export function blockedServiceForHost(host: string): BlockedService | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  for (const service of BLOCKED_SERVICES) {
    for (const blocked of service.hosts) if (h === blocked || h.endsWith(`.${blocked}`)) return service;
  }
  return null;
}

/** The same question of a URL, about the host a browser would visit: `new URL` is the
 *  browser's own parser, so `https://js.stripe.com\\@evil.com` is Stripe here as it is to
 *  Chrome. A protocol-relative `//js.stripe.com/v3` is read as https, as limits.py does.
 *  Anything that does not parse is not a host we can name. */
export function blockedServiceForUrl(url: string): BlockedService | null {
  try {
    return blockedServiceForHost(new URL(url.trim().startsWith("//") ? `https:${url.trim()}` : url).hostname);
  } catch {
    return null;
  }
}

/* The npm name a package CDN would serve for a URL, read the same way by limits.py
   (`blocked_package_for_url`), and by hand rather than through `new URL` so that the
   two languages run one algorithm instead of two parsers. The parts a browser would
   normalise before the CDN sees them are normalised here too: a backslash is a slash,
   the host is the one after the last `@`, `.` and `..` segments are resolved, and
   percent escapes are decoded a byte at a time. Empty segments are dropped, which is
   stricter than a browser and costs nothing, since no package name is empty. */
const CDN_URL = /^\s*(?:(?:https?|wss?):)?[/\\]{2}([^/\\?#]*)([^?#]*)/i;
const percentDecoded = (s: string) => s.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

function packageCdnHost(authority: string): boolean {
  let host = percentDecoded(authority.slice(authority.lastIndexOf("@") + 1));
  if (host.startsWith("[")) return false;
  if (host.split(":").length === 2) host = host.slice(0, host.indexOf(":"));
  host = host.trim().toLowerCase().replace(/\.$/, "");
  return PACKAGE_CDN_HOSTS.some((cdn) => host === cdn || host.endsWith(`.${cdn}`));
}

/**
 * The prefixes the CDNs put in front of the package name, peeled until the name is
 * first: jsDelivr's `npm/`, esm.sh's `v135/`, `stable/` and `*`, jspm's `npm:`,
 * Skypack's pinned `-/`, unpkg's `browse/`, cdnjs's `ajax/libs/`. Not keyed by host,
 * because a host that does not use a prefix never serves a package by that name, and
 * one table both languages can hold equal is worth more than a precise one per CDN.
 */
function packageName(segments: string[]): string | null {
  const s = [...segments];
  for (let changed = true; changed && s.length;) {
    changed = true;
    if (/^(?:v\d+|stable|pin|npm|browse|-)$/.test(s[0]!)) s.shift();
    else if (s[0] === "ajax" && s[1] === "libs") s.splice(0, 2);
    else if (s[0]!.startsWith("npm:")) s[0] = s[0]!.slice(4);
    else if (s[0]!.startsWith("*")) s[0] = s[0]!.slice(1);
    else changed = false;
  }
  const [first, second] = s;
  if (!first) return null;
  if (first.startsWith("@")) {
    const name = second?.split("@")[0];
    return first.length > 1 && name ? `${first}/${name}` : null;
  }
  return first.split("@")[0] || null;
}

function blockedPackageNamed(name: string): PackageHit | null {
  for (const group of BLOCKED_PACKAGES) {
    for (const entry of group.packages) {
      if (entry.endsWith("/") ? name.startsWith(entry) : name === entry) {
        return { service: group.name, category: group.category, severity: group.severity, package: name };
      }
    }
  }
  return null;
}

/**
 * The blocked package a script CDN URL serves, or null: `https://esm.sh/@stripe/stripe-js@4`
 * is Stripe, `https://cdn.jsdelivr.net/npm/ethers@6/+esm` is a crypto library. A service's
 * own host is caught by `blockedServiceForHost`; this is the same SDK fetched from a host
 * the policy allows, which passed every checker until 26 Oct 2026. jsDelivr's
 * `combine/npm/a,npm/b` is read as the list it is.
 */
export function blockedPackageForUrl(url: string): PackageHit | null {
  const m = CDN_URL.exec(url);
  if (!m || !packageCdnHost(m[1]!)) return null;
  const segments: string[] = [];
  /* Decoded before it is split, so `@stripe%2Fstripe-js` is two segments: a CDN that
     decodes the slash serves the package, and one that does not serves a 404. */
  for (const segment of percentDecoded(m[2]!).replace(/\\/g, "/").toLowerCase().split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  const parts = segments[0] === "combine" ? segments.slice(1).join("/").split(",").map((p) => p.split("/")) : [segments];
  for (const part of parts) {
    const name = packageName(part);
    const hit = name ? blockedPackageNamed(name) : null;
    if (hit) return hit;
  }
  return null;
}

/**
 * Every place in `text` a blocked service's code signature appears, in order.
 *
 * The caller decides what counts. The preflight skips comments the way its origin check
 * does, since a comment is not a call; the jam scan does the same through `inert.py`.
 */
export function blockedPatternHits(text: string): PolicyHit[] {
  const hits: PolicyHit[] = [];
  for (const { service, severity, re } of compiled) {
    for (const m of text.matchAll(re)) {
      hits.push({ service: service.name, category: service.category, severity, index: m.index ?? 0 });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Shapes worth a reviewer's eye that refuse nothing: an email field, a password field. */
export function reviewSignalHits(text: string): ReviewSignalHit[] {
  const hits: ReviewSignalHit[] = [];
  for (const s of signals) {
    for (const m of text.matchAll(s.re)) hits.push({ label: s.label, category: s.category, index: m.index ?? 0 });
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** The sentence a finding about one category ends with. */
export function policyRule(category: PolicyCategory): string {
  return POLICY_CATEGORIES[category].rule;
}
