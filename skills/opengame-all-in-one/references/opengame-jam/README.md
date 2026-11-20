> Carried from `opengame-jam` 1.1.4. Read it when: Enter a game in an OpenGame jam. Finds the open jams, their tracks and rules, checks the game against them, deploys one exact release, and enters it with the person's own answers, with opengame publish or on the deploy's page. Use when the person says enter the jam, submit to the jam, which track should I pick, am I eligible, what are the jam rules, or mentions the OpenGame Global AI Game Jam.


# Enter an OpenGame jam

The jam kicked off on 18 November, and entries close on 18 December, 11:59 pm PT. After the
close, a game entered in the jam keeps the version that was live then, and a new build cannot
replace it, in the jam or in the gallery.

Any signed-in account can enter the jam. Run `opengame login` first.

While the jam runs, until it closes on 18 December, 11:59 pm PT, a new original game goes on
OpenGame only as a jam entry, up to 2 per account, unless the
account is an OpenGame admin or an approved publisher. A mod or a decomp is never an entry:
it goes on OpenGame under Just for fun at any time. After the close anyone can publish to
the gallery, outside the jam. A jam entry is one exact release, reviewed automatically, then
judged by people. Deploy the game first: read `opengame-deploy` if the game has no
`releaseId` yet.

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
  or a mod is made from someone else's game, so it cannot meet the rules above, and the
  server refuses it as an entry (`kind_not_in_jam`). It still goes on OpenGame, under Just
  for fun, at any time. If the kind is wrong, fix it in `opengame.json` and
  deploy again; do not change it only to get past this rule.
- **Individual creators, 18 or over, no teams**, up to
  2 entries each.

If something looks like it breaks a rule, tell the person what and where, and let them
decide. Do not hide a dependency, rewrite history or relabel a library to pass a rule.

## Pick a track with the person

The person gives these answers, on the deploy's page or to you for `opengame publish`.
Help them prepare the answers; do not answer for them.

- **Genre track:** one per entry, required. The page starts on the track that matches the
  game's genre; the person keeps it or chooses another.
- **Models used:** ask the person which models they used; do not guess from the code.
- **Sponsor tracks:** earned, not picked. A sponsor's track opens only once a model from
  that sponsor is listed under models used, and asks for the email of the account the
  person used there.

`opengame jams <slug> --json` lists the whole form.

## Deploy, then enter it

Ask first, every time. Before `opengame deploy` and again before `opengame publish`, stop:
show the person the game, its title, and the track and models you suggest, and wait for a
clear yes. While the jam runs, a deploy of a new game uses one of their
2 entries until they withdraw it with `opengame jam withdraw`, and a redeploy of a live
entry goes live by itself once review passes. Never deploy because the game looks finished.

Follow `opengame-deploy` for installation, sign-in and the deploy. Use the exact release
the creator played. Once the deploy is ready, review starts by itself; nobody runs a
command for it. When `opengame status --json` shows `data.review.state` as
`awaiting_details`, review has passed, and the entry is made one of two ways:

- **The person asked you to enter it, and said yes to these answers.** Run `opengame publish` with them:

  ```bash
  opengame publish --track <track> --models <model>,<model> \
    --sponsor <sponsor> --sponsor-email <sponsor>=<their email> --json
  ```

  It enters the jam, publishes, waits until the game is live, and prints the address to
  share in `data.url`. `opengame deploy --publish` with the same flags does the deploy,
  the wait for review and the entry in one command.
- **Otherwise,** give the person `data.review.url`, the deploy's page. Signed in there,
  they press Confirm details, choose the track, the models and any sponsor tracks, and
  publish.

Do not run `opengame submit` to enter the jam or to publish. It does not confirm a release
its deploy already sent to review: it answers with that submission and a
`jam_answers_unused` notice, and the answers go nowhere.

## What only the person can do

Nobody certifies or attests to anything to enter. The person decides whether they are eligible (age, one account), whether they own
the assets, which track they want, and which account they used at each sponsor.

## After submitting

`opengame status . --watch --json` follows review until it finishes or the watch
ends. The result's `review` has the state, `done`, and `next`, the command to run. No
person reviews a game. Review either lets it through or returns it with the reason, and
people judge the jam. A returned entry's findings come as `finding` events, the same as a
deploy's. Fix them, ask the person, and deploy again once they say yes; the new release goes to review by itself. While the jam
takes entries, a redeploy of a game whose entry is live is entered again with the same
answers, so it keeps its place.

The jam's judging criteria are published on its rules page, which is the authority: creativity
and originality, depth, fun, performance and visual fidelity, none weighted above another. The
craft skills (`opengame-quality-bar` first) are how to raise them.
