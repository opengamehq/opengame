import { z } from "./zod";

/**
 * Where a deploy's files came from, when the creator named somewhere other than their own
 * disk. Today that is one kind: a public GitHub repository at one commit, read by the
 * /deploy page's GitHub tab.
 *
 * It is a claim the creator makes, kept with the operation so the deploy page can offer
 * Redeploy from the same repository, branch and folder. Before anything is stored the server
 * checks that the commit is the named branch's or release's own in that repository, and that
 * an opengame.json at that commit, if it names an owner, names the deploying account
 * (lib/platform/github/ownership.ts). Since 10 Nov 2026 a repository needs no opengame.json,
 * so the claim does not prove the repository is the creator's. The bytes go through the same
 * checks a Drop's do, whatever the claim says.
 */
export const deploySourceSchema = z.strictObject({
  kind: z.literal("github"),
  owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/),
  repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/).refine(name => name !== "." && name !== ".."),
  /** The branch or tag the creator chose, so Redeploy can resolve it again. The server
      checks the commit is this ref's own in this repository (github/ownership.ts), so the
      name is held to git's ref-name rules as well: a control character, a `..`, an `@{`, a
      leading or doubled slash or a `.lock` ending is no ref anybody could have listed. */
  ref: z.string().min(1).max(255).regex(/^[^\s~^:?*[\\]+$/)
    .refine(ref => ![...ref].some(char => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)
      && !/\.\.|@\{|\/\/|^\/|\/$|^\.|\/\.|\.lock$|\.lock\/|^@$/.test(ref), "Name a branch or tag the repository lists."),
  refKind: z.enum(["branch", "release"]),
  /** The commit the files were read at. */
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  /** The build folder, relative to the repository root; "" is the root itself. */
  folder: z.string().max(512).regex(/^(?:[^/\\:]+(?:\/[^/\\:]+)*)?$/).refine(folder => !folder.split("/").some(part => part === "." || part === "..")),
});
export type DeploySource = z.infer<typeof deploySourceSchema>;

export function deploySourceUrl(source: DeploySource): string {
  const base = `https://github.com/${source.owner}/${source.repo}`;
  return source.folder ? `${base}/tree/${source.commit}/${source.folder}` : `${base}/tree/${source.commit}`;
}

/**
 * The manifest fields an upload sent only because the request requires them, which the
 * creator confirms after review instead. Not whether the game is multiplayer: review's
 * multiplayer check runs on that, so the upload asks it (the one flow).
 * Drop and the GitHub tab set these when the folder has no opengame.json saying them. The
 * review lane reads it so a placeholder genre is never taken for the creator's word, and the
 * details form reads it to prefill from what review detected rather than from the
 * placeholder.
 *
 * `description` joined them on 11 Nov 2026, when the CLI stopped asking for one in the
 * terminal (the owner: "we shouldnt make people manually fill out stuff like genre and
 * description in the terminal"). A folder with no words of its own deploys with
 * PLACEHOLDER_DESCRIPTION, and the deploy's page asks for the real one before the game can
 * publish.
 *
 * `title` joined on 13 Nov 2026: a name the CLI's init or Drop read from the page's <title> or
 * the folder, not one anybody typed, so the deploy's page may offer the name review reads from
 * the game instead (launch E2E, J-astra-E9, "Game Development Assignment").
 */
export const deployProvisionalSchema = z.array(z.enum(["genre", "controls", "description", "title"])).max(4)
  .refine(items => new Set(items).size === items.length, "Name each provisional field once.");

/**
 * The description a deploy carries when nobody has written one yet. One fixed sentence, so
 * the server can tell it from a creator's words wherever it meets it (the game row, an older
 * release) without trusting a flag the client sent, and so it is long enough for the
 * manifest's minimum and says nothing review could find untrue. It is never meant to reach a
 * player: the site's details step asks for the real one before a game holding it can
 * publish.
 */
export const PLACEHOLDER_DESCRIPTION = "The creator has not written a description for this game yet.";
export type DeployProvisional = z.infer<typeof deployProvisionalSchema>[number];
