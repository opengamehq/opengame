import { CONTRACT_VERSIONS, CURRENT_CONTRACT, needsServingInventory } from "../../../infra/worker/src/contracts";
import { contractCapabilities, THREADED_MOVES } from "@opengame/shared/runtime-contracts";

/* What `dev --contract` says about each runtime contract, apart from dev.ts. The command
   table in cli.ts prints this in every `--help`, and cli.ts builds that table when the CLI
   starts, so whatever module holds it is loaded by every command. In dev.ts it took the
   dev server's whole graph with it (the deploy, the preflight, the vendoring, infra's
   Worker modules) into `opengame --help`, `opengame login` and every other command that
   serves nothing (round 173A, 24 Nov 2026). */

/**
 * The contract whose releases the pipeline derives, named by the Worker's own rule rather
 * than by a date written out here (`needsServingInventory`). It is 2027-01, the one that
 * also granted eval, and it is deprecated for good: its runtime_contracts row carries
 * deprecated_at and is not default-eligible, and a threaded scan moves a release onto
 * 2027-02 instead. dev still serves it, because a contract the Worker serves is one a
 * pinned release could be on.
 */
export const ENGINE_CONTRACT = CONTRACT_VERSIONS.find(version => needsServingInventory({ contractVersion: version }))!;

/**
 * `dev --contract` help, read from the capability table in limits.json so it cannot go on
 * describing a contract after the table changes. It said 2027-01 was "experimental and has
 * not been tested on the live site yet" for two days after 2027-02 replaced it and went
 * live, because the sentence was typed rather than read from anywhere.
 *
 * The network is read from the same table (`openNetwork`), because 2027-03 and 2027-04 are
 * the first contracts that differ from their neighbours mainly in what a game may reach,
 * and a help line that named only isolation and eval would describe 2027-04 and 2027-01 in
 * identical words. Which contract a threaded release moves to is read from threadedMoves
 * for the same reason: there are two pairs now, and the sentence names its source.
 */
export function contractHelp(): string {
  const powers = (version: string) => {
    const caps = contractCapabilities(version)!;
    const powers = [["cross-origin isolation", caps.crossOriginIsolated], ["eval", caps.unsafeEval]] as const;
    const yes = powers.filter(([, on]) => on).map(([name]) => name), no = powers.filter(([, on]) => !on).map(([name]) => name);
    const allows = !yes.length ? `neither ${no.join(" nor ")}` : yes.join(" and ") + (no.length ? ` but not ${no.join(" or ")}` : "");
    return { allows, reach: caps.openNetwork ? "any https host" : "only OpenGame's own hosts", sdk: caps.sdkInjection === "none" ? "no SDK" : "the SDK to every page" };
  };
  // Neighbouring versions that allow the same things are named together.
  const groups: { versions: string[]; key: string }[] = [];
  for (const version of CONTRACT_VERSIONS) {
    const key = JSON.stringify(powers(version)), last = groups.at(-1);
    if (last?.key === key) last.versions.push(version); else groups.push({ versions: [version], key });
  }
  const sentences = groups.map(({ versions }) => {
    const { allows, reach, sdk } = powers(versions[0]!), one = versions.length === 1;
    const movedFrom = Object.entries(THREADED_MOVES).filter(([, to]) => versions.includes(to)).map(([from]) => from);
    return [`${versions.join(" and ")} ${one ? "allows" : "allow"} ${allows}, ${one ? "lets" : "let"} a game reach ${reach}, and ${one ? "adds" : "add"} ${sdk}.`,
      versions.includes(ENGINE_CONTRACT) && "It is deprecated, and no new release gets it.",
      movedFrom.length > 0 && `A release on ${movedFrom.join(" or ")} whose scan finds threads is moved onto it automatically.`].filter(Boolean).join(" ");
  });
  return `Runtime contract. Defaults to ${CURRENT_CONTRACT}, which new games are published under. ${sentences.join(" ")}`;
}
