---
name: opengame-jam
description: Enter a game in an OpenGame jam. Finds the open jams, their tracks and rules, checks the game against them, and submits one exact release as an entry with the person's own answers, leaving the certification to the person. Use when the person says enter the jam, submit to the jam, which track should I pick, am I eligible, what are the jam rules, or mentions the OpenGame Global AI Game Jam.
metadata:
  version: "1.0.8"
---

# Enter an OpenGame jam

OpenGame opens on 18 November 2026. The jam kicks off on 18 November, and entries close on
18 December, 11:59 pm PT; after the close every deploy path answers `entries_closed`.

Any signed-in account can enter the launch jam now, before 18 November as well as
after it. A CLI with no login hears "OpenGame opens for creators on 18 November." until
then: run `opengame login` first.

A jam is an extra destination for a game already on OpenGame. Games go to the
marketplace; a jam entry is one exact release submitted with the jam's answers,
reviewed, then judged by people. Deploy the game first: read `opengame-deploy` if the
game has no `releaseId` yet.

No jam is built into the CLI. Tracks, fields, rules and the certification text come
from the server, so the next jam needs no new CLI. Read them fresh each time; do
not answer from memory or from this file.

## Find the jam and its rules

1. `opengame jams --json` lists the jams with their slug, state, tracks and a rules link.
2. Read the rules page. Tell the person, in a sentence each, the rules their game might
   break. Eligibility is theirs to decide.

## Check the game against the rules before submitting

The first jam's published rules, as an example of what to check (the server's copy is
the authority):

- **Made during the jam.** Started after kickoff. Earlier libraries and boilerplate
  are fine; an earlier prototype of this game is not.
- **Exports a web build.** Any engine works if its web build (HTML5, WebGL, WebGPU
  or WebAssembly) runs from static files. `opengame check` names the engine it detects
  and reports the problems it can find before a deploy.
- **Runs in a desktop browser** with nothing to install, no account, no sign-in and no
  email address, and responds to the window being resized.
- **May call out, within the platform rules.** At runtime the game may call AI models,
  third-party APIs and its own servers, besides `https://api.opengame.gg` for
  scores. It must still draw its first frame offline, because review runs without the
  internet. Keys stay on the creator's server, never in the bundle.
- **Free to play, with no crypto, ads or tracking.** No payments, tips or donations, no
  wallets or tokens, no ads or ad pixels, no session recording. `opengame-deploy` has
  the full rules.
- **Inside the bundle limits:** 4096 MiB zipped,
  5120 MiB unzipped, 25,000 files.
- **The person owns the art, audio, models, fonts and code**, or holds a licence to
  ship them.
- **A game or a world, not a decomp or a mod.** Read `kind` in `opengame.json`. A decomp
  or a mod is made from someone else's game, so it cannot meet the rules above.
  `opengame submit` stops it, and the server returns `kind_not_in_jam`. It can still go
  on OpenGame, but not into the jam. If the kind is wrong, fix it in `opengame.json` and
  deploy again; do not change it only to get past this rule.
- **Individual creators, 18 or over, no teams**, up to
  2 entries each.

If something looks like it breaks a rule, tell the person what and where, and let them
decide. Do not hide a dependency, rewrite history or relabel a library to pass a rule.

## Pick a track with the person

- **Genre track:** one per entry, required. The CLI suggests one from the game's
  `genre` in `opengame.json`; the person confirms or changes it.
- **Sponsor tracks:** earned, not picked. The CLI offers a sponsor track only when the
  person used a model from that sponsor. Each takes an optional evidence note of up to
  2,000 characters about what the model did ("all 38 prop
  textures and the menu film"). A reviewer checks it, so write only what is true and
  what a reviewer can find in the game.
- **Models used** (`--models`) is the one other field. `opengame jams <slug> --json`
  lists the whole form. Ask the person which models they used; do not guess from the
  code.

## Deploy and submit

Follow `opengame-deploy` for the shared installation, sign-in, deploy and submission procedure. The server selects the destination for the current jam; fetch its fields with `opengame jams <slug> --json`. Use the exact release the creator played.

## What only the person can do

**Certification is the person's legal statement**, made in their browser under a
versioned set of terms. When the result asks for it, give the person the link and tell
them what it is for. Do not open it for them, click through it, or tell them it is
done. A later revision of the same entry under the same terms skips it.

The person also decides whether they are eligible (age, one account), whether they own
the assets, which track they want, and what their sponsor evidence claims.

## After submitting

`opengame status . --watch --json` follows review until it finishes or the watch
ends. The result's `review` has the state, `done`, and `next`, the command to run. A
returned entry's findings come as `finding` events, the same as a deploy's. Fix them,
deploy a new release, and submit that release. Review is automated first, then a
person; people judge the jam. Judges see the release that was submitted, so later
edits count only once a new release is submitted.

The jam's judging criteria are published on its rules page. Fun and craft carry the
most weight; the craft skills (`opengame-quality-bar` first) are how to raise them.
