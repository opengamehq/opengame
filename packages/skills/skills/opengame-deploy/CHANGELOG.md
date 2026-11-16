# opengame-deploy changelog

## 1.1.7

An agent publishes with `opengame publish` or `opengame deploy --publish` when the creator asks, and otherwise gives them the deploy's page. An update of a live game publishes by itself, keeping its details and jam entry (16 Nov 2026).

## 1.1.6

The creator no longer certifies anything on the deploy's page: entering the jam is the track and the models, then publish (16 Nov 2026).

## 1.1.5

A multiplayer section: invite links through `og.invite.link`, PeerJS on the creator's own servers with TURN, and game servers over `wss:` with an exact `Origin` check and a token rather than a cookie.

## 1.1.4

The procedure now says review starts by itself once a deploy is ready, and the creator confirms the details on the deploy's page; init's fields default to Auto. OpenGame no longer scans builds for malware or keys, moderates images or reviews text: the packaging reference says to keep keys on the creator's server and rotate any that shipped, lists the native programs a build is refused for, and drops the malware scan and the checks a person used to decide from its table. The JSON reference lists exit code 7 (`not_launched`) and shows the engine finding as the CLI prints it now.

## 1.1.3

Says that `opengame skills add .` installs a starting set, how to add one more skill, and that `--skill opengame-all-in-one` installs every skill as one.

## 1.1.2

Any signed-in account can use the CLI, the creator API, uploads and jam entries before launch, so a `not_launched` answer means the request came with no account: sign in (`opengame login`) and run it again rather than waiting for 18 November.

## 1.1.1

A build can be 4 GiB zipped, 5 GiB unpacked and 25,000 files, from 1 GiB, 1.5 GiB and 10,000 files. The manifest and packaging references now say a game may declare 25 leaderboards, as 1.1.0 did, where they still said 10. OpenGame opens on 18 November 2026, the jam's kickoff, not 17 November: the site no longer opens a day before the rest.

## 1.1.0

Do not ask the creator for a description or a genre before deploying. init writes a placeholder description and a provisional genre when the game says neither, the deploy's page asks for both, and `opengame details --description` sets the description once the game exists.

A game may declare up to 25 leaderboards.

## 1.0.9

The site opens on one day and the CLI, uploads and the creator API on the next, the jam's kickoff. Until then an account outside the team is told that day, read from the launch clock.

## 1.0.8

`opengame deploy` returns the origin the published game runs at as `data.gameOrigin`, such as `https://k3v9q2m7x4ab.opengame.gg`. When the creator's own servers check `Origin` or send CORS headers, the agent tells them to allow that exact origin, never `null` or a pattern on `opengame.gg`, to add a version's `v-` origin before an experiment, and to send a token rather than rely on a cookie. A private preview runs on a temporary origin of its own. That address is a private link, so the agent keeps it out of committed config and logs.

## 1.0.7

`opengame.json` no longer takes a `cover`. OpenGame makes the cover, banner and share image after review approves the game, so leave the field out; a file that still names one passes `check`, and the CLI does not upload it.

A build can be 1 GiB zipped and 1.5 GiB unpacked, from 500 MiB and 1 GiB. The CLI sends an archive that large in parts and resumes it where it stopped. The packaging notes and the submit step no longer say a reviewer plays or publishes every game.

## 1.0.6

Until the CLI is on npm, the install step tells the agent to stop when `opengame` is missing and send the creator to team@opengame.io for a copy, rather than writing in itself.

## 1.0.5

Names the day OpenGame opens and the day jam entries open, read from the launch clock. The install step says to write to team@opengame.io for the CLI while it is not on npm.

## 1.0.4

Before the packages are on npm, the install step says to ask the OpenGame team for the CLI, and copy that only fits a real npm install waits until then.

## 1.0.3

The note about launch no longer prints a date, which lives only in the launch clock, and names every command that answers before launch. The install step follows the docs: it names no npm command until the packages are published.

## 1.0.2

The manifest reference lists only the fields a release uses, and the packaging notes name achievements among what the page provides. The note that OpenGame is not open yet is back at the top.

## 1.0.1

Use the public npm CLI installation and API origin instructions.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
