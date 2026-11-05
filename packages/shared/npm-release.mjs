/**
 * The one reading of packages/shared/npm-release.json, for every surface that might name an
 * npm install command or a published version: the docs build and the docs' own script, the
 * Upload page, the agent prompt and the specimens. A code review on 5 Nov 2026 found three
 * readings of the file (both keys for the docs, `published` alone for the site, `scopeOwned`
 * alone for the mirror), so a file with `published` set first, or written as the string
 * "false", would have printed an install line on one surface and not the others.
 *
 * Open only when an owner has confirmed both that OpenGame owns the @opengamehq scope on npm
 * and that the packages are published, each as the boolean true.
 */
export const installsOpen = (release) => release?.scopeOwned === true && release?.published === true;

/* The first npm publish of each package goes out while the committed switch still says
   `published: false`, because npm lets a trusted publisher be set only on a package that
   exists, and the switch is flipped by hand once npmjs.com shows the packages. Built from the
   committed file, that first tarball would tell everybody who had just installed it from npm
   that it is "not on npm yet", in its bundled copy of the switch and in every skill it ships.

   So scripts/release.mjs sets OPENGAME_RELEASE_NPM_OPEN for the builds of a package it is
   about to publish, and each build that reads the switch (the CLI's bundle and the skills'
   renderer) reads it through this one function, which then answers published. release.mjs
   stages the package's own prose through it as well, so the builds and the staging cannot
   decide the question two ways. The file on disk is never rewritten. It opens nothing while
   the scope is not ours. `env` is passed in rather than read here, because this module also
   runs in the browser.

   The checks below are a guard against a mistake, not a security boundary. They read
   environment variables, and anybody can set all of them, so a person who wants a local
   bundle that says published can have one. What they stop is the ordinary accident: a
   variable left in a shell or inherited by a build that is not a release, opening one surface
   while the others stay shut. Whether anything reaches npm is decided by the npm credential,
   an owner's own login with two-factor for the first publish of each package and the publish
   workflow's OIDC trusted publisher after that, and by nothing in this file. */

/** The branch the publish workflow runs from. It is named here and nowhere else in the
 * release path, because scripts/public-mirror.mjs rewrites this one line for the public
 * repository, whose default branch is main; a second copy elsewhere would keep master in the
 * public tree and refuse every release made there. */
export const RELEASE_REF = "refs/heads/main";

/** Whether `env` is the manually approved publish workflow running from RELEASE_REF. */
export const releaseWorkflowApproved = (env) => env?.GITHUB_ACTIONS === "true" && env?.OPENGAME_RELEASE_APPROVED === "true" && env?.GITHUB_REF === RELEASE_REF;

export function npmReleaseForBuild(release, env) {
  const mode = env?.OPENGAME_RELEASE_NPM_OPEN;
  if (mode === undefined) return release;
  if (!env.OPENGAME_RELEASE_VERSION || !(mode === "first-publish" || (mode === "approved" && releaseWorkflowApproved(env))))
    throw new Error("OPENGAME_RELEASE_NPM_OPEN is set only by scripts/release.mjs, for a package it is about to publish.");
  if (release?.scopeOwned !== true) throw new Error("OPENGAME_RELEASE_NPM_OPEN is set and packages/shared/npm-release.json does not say the scope is ours.");
  return { ...release, published: true };
}

/* What every surface says about installing a package before the switch opens, and the
   command it prints after. The docs' NOT_YET (scripts/docs-install.mjs) is these three under
   the component names, so a README, a skill, the agent prompt and a docs page cannot word the
   same fact two ways.

   `cli-agent` and `sdk-agent` are the same steps for a reader that is a coding agent: the
   agent prompt, the For agents guide, the public for-agents.md and the skills. The person's
   sentence asked an agent to write an email (design review, 5 Nov 2026), so these send it
   back to the creator. Open, each is the same command as its package. They are keys here
   rather than a table of their own so that scripts/release.mjs, which swaps each shut
   sentence in a staged AGENTS.md for its command, swaps these too. */
export const INSTALL_CLOSED = Object.freeze({
  cli: "The CLI is not on npm yet. Write to team@opengame.io for a copy.",
  sdk: "The SDK is not on npm yet. Write to team@opengame.io for a copy.",
  skills: "The skills come with the CLI: run `opengame skills add` in your game's folder.",
  "cli-agent": "The CLI is not on npm yet. If `opengame` is not installed, stop and tell the creator to write to team@opengame.io for a copy.",
  "sdk-agent": "The SDK is not on npm yet. If the game has no copy of it, stop and tell the creator to write to team@opengame.io for one.",
});

/* The skills install from the public source repository rather than the npm package, which
   is why that command names a GitHub path. It is the same scope, so the same switch holds it. */
const SKILLS_SOURCE = "opengamehq/opengame";

/* `npm i <name>` with no tag keeps whatever spec package.json already has for that name,
   and every starter's package.json links the SDK to its folder inside the repository
   (`file:../../packages/sdk`). Run in a copied starter, the untagged command reported
   success and left that link, which points nowhere outside the repository. With @latest npm
   replaces the link with the registry's version (measured with npm 10 on 5 Nov 2026, on a
   package with a `file:` dependency). So the starter form carries the tag. */

/** The command for one of `cli`, `sdk` or `skills`, or null while the switch is shut.
 * `starter` asks for the SDK command a copied starter needs. */
export function installCommand(name, release, { starter = false } = {}) {
  if (!installsOpen(release)) return null;
  if (name === "cli") return `npm i -g ${release.packages.cli}`;
  if (name === "sdk") return `npm i ${release.packages.sdk}${starter ? "@latest" : ""}`;
  if (name === "skills") return `npx skills add ${SKILLS_SOURCE}`;
  throw new Error(`No install command for ${JSON.stringify(name)}; use cli, sdk or skills.`);
}

/** Markdown for one install step: the closed sentence, or the command in a bash block. */
export function installMarkdown(name, release) {
  if (!Object.hasOwn(INSTALL_CLOSED, name)) throw new Error(`No install step for ${JSON.stringify(name)}; use cli, cli-agent, sdk, sdk-agent or skills.`);
  const command = installCommand(name.replace(/-agent$/, ""), release);
  return command ? ["```bash", command, "```"].join("\n") : INSTALL_CLOSED[name];
}

/* A Markdown file that ships as it is (a package README, the public repository's README)
   marks each install step as a block, and scripts/npm-release-sync.mjs rewrites the inside
   from the switch. The markers are HTML comments, so npm and GitHub show only the step. */
const INSTALL_BLOCK = /<!-- install:([a-z]+) -->\n([\s\S]*?)\n?<!-- \/install -->/g;

/** The text with every install block rewritten for `release`. */
export function writeInstallBlocks(text, release) {
  return text.replace(INSTALL_BLOCK, (_whole, name) => `<!-- install:${name} -->\n${installMarkdown(name, release)}\n<!-- /install -->`);
}

/** The names of the install blocks in a text, in order. */
export const installBlocks = (text) => [...text.matchAll(INSTALL_BLOCK)].map(([, name]) => name);

/** Lines that state the shut switch while it is open: "not on npm yet" beside a command
 * is the contradiction no surface may print. The typed-command half, for the shut switch,
 * is typedInstallProblems in scripts/docs-install.mjs, which every caller runs beside this. */
export function closedWordingProblems(text, release) {
  if (!installsOpen(release)) return [];
  return text.split("\n").flatMap((line, index) => /not on npm yet/i.test(line) ? [`line ${index + 1}: ${line.trim()}`] : []);
}
