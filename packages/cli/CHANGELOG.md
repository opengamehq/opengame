# Changelog

## 0.9.1

- `opengame deploy --wait` shows the deployment checklist shared with Drop and prints the page where upload, checks, review and publication update live. JSON output keeps its existing event format.

## 0.9.0

- `opengame login --continue` no longer loses a login you already allowed. Each run
  started from the first polling interval and polled again as its time ran out, so a
  script or agent running it over and over was told to slow down every time, until the
  next poll it was allowed fell after the code expired. It now keeps the pace the server
  sets between runs and never polls early. The server also hands over an allowed login on
  the next poll whatever its pace, so 0.8.0 recovers too.
- `opengame deploy`, `check --build`, `dev --build` and `vendor --build` install your
  dependencies before the build in a fresh checkout (a lockfile and no `node_modules`), with
  the command the lockfile names (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install`
  or `bun install`). When `node_modules` is there but packages are missing, or the lockfile
  is in a parent workspace, or there is none, they stop and name the missing packages and
  the install to run, so nothing you installed is wiped. `--no-install` skips the step. A
  build that fails with "command not found" now says the tool is probably not installed.
- `opengame init` on a Vite or other bundler project sets the export folder to the
  bundler's output (`dist`, or `build.outDir` from vite.config) and no longer picks an
  `index.html` inside `src/`. It also reads a project's files in far fewer passes, so it
  no longer sits silent for many seconds after the last question.
- In a terminal, the CLI shows a spinner with a line saying what it is doing while a
  command works, and the time once it passes five seconds. Scripts, `--json`, `--jsonl`
  and agents get no spinner.
- Questions and the summary after them line up in one column, with one blank line around
  the form, and long lines wrap inside the terminal.
- An error that has a next step prints it as `Try: <command>`, and many errors that only
  said what went wrong now also say what to do. A build failure no longer repeats its
  next step.
- `opengame init` asks a person one thing, the game's name, with what it read from
  index.html, package.json or the folder offered as the answer. It no longer asks what you
  are making, which game a mod is based on, a description or a genre. `--kind`,
  `--based-on`, `--description` and `--genre` still set any of them.
- With no description of its own, a project gets a placeholder sentence, which a deploy
  marks provisional. The deploy prints its page, where you write the description, choose
  the genre and enter the jam; the game cannot publish with the placeholder.
- `opengame submit` no longer walks a person through the jam's form. With no jam answer
  named, it prints the deploy's page, where the entry is made, and sends nothing. Agents
  still answer with `--track`, `--models` and `--sponsor`.
- Needs the website from the same release: an older server refuses `description` in a
  deploy's provisional fields.
- `opengame check` and deploy no longer refuse a game for the `http://yandex.com/bots` entry
  in PostHog's bot list, which is text the library matches against and never requests.
  PeerJS's default public relays are one note instead of three warnings, and a file a
  loader asks for by bare name (KTX2Loader's `basis_transcoder.wasm`, a Draco decoder) is
  no longer reported missing when it is in the bundle under another folder.
- A build whose archive would be past 200 MiB goes file by file when your account allows
  it: files OpenGame already has are skipped, and the archive is written to
  disk a slice at a time instead of held in memory. A build can be 25,000 files, 5 GiB
  unpacked and 4 GiB zipped. A build the file-by-file plan cannot take, such as a Kaigen
  export or one whose bulk is code, or a machine without Python 3 (Windows included), still
  sends one archive as before.

## 0.8.0

- `opengame init` guesses a genre from the title, the description, the page's meta
  description and package.json's keywords, as its help says. When none of those names a
  genre, it asks a person, and an agent or a script gets `puzzle-casual`, with the line to
  change it. It used to leave genre blank, and `opengame check` then refused the file.
- `opengame init` in a folder whose opengame.json leaves title, description, genre or
  controls blank fills those in and keeps everything the file sets. It used to stop because
  the file existed. A file with nothing blank is still refused, and a flag for a field the
  file already sets is named as unused. If the file is saved while init is asking a
  question, init keeps that edit and writes nothing.
- `opengame init` sets controls from the keyboard, mouse, touch and gamepad listeners in
  your game's own source. Touch counts as mouse, so a game that only listens for taps or
  clicks gets `mouse`. It used to write keyboard and mouse whatever the game used, and
  still does when it finds no input at all.
- A genre or controls that init chose without being told are marked provisional when you
  deploy, as Drop and the GitHub tab already do, so the details form after review offers
  what review detected rather than treating the guess as your choice. Change either in
  opengame.json and it is yours.
- `opengame check` says how to set a blank or unknown genre, naming the genres and the
  init line that fills it, rather than "Correct genre in opengame.json".
- Ships the skills from `@opengamehq/skills` 1.3.0, as 0.7.0 did.

## 0.7.0

- `opengame unpublish` takes a game off the gallery and stops serving it, and `opengame
  restore` puts a game you unpublished back, through the same checks and audit as
  Unpublish and Put it back on Your games. A person is asked first; an agent or a script
  passes `--yes`. Both need a token with the `submit` permission, which `opengame login`
  gives.
- `opengame details` prints a game's title, tagline and description as the website shows
  them, and `--title`, `--tagline` and `--description` change them, through the same
  checks as the Details tab on the game's page. It needs the `submit` permission.
- `opengame handle <name>` renames your handle, through the same limits and checks as
  Settings. A person is asked first; an agent passes `--yes`. Only the `opengame login`
  token can do it.
- `opengame jam withdraw` takes the linked game's jam entry out of the jam and frees its
  place, and `opengame jam reenter` puts a withdrawn one back while the jam is open, as
  the jam entries page does. Withdrawing asks first; an agent passes `--yes`.
- `opengame delete` deletes a game for good, through the same checks as Delete for good
  on its page. You type its title to confirm; an agent passes `--title` and `--yes`. Only
  the `opengame login` token can delete.
- `opengame achievements` lists a game's achievements, and `opengame achievements retire
  <id>` retires one, as the website's achievements step does. Retiring now needs the
  `submit` permission as well as `deploy`, from the CLI and the API alike; a deploy's own
  save of its declared achievements still needs only `deploy`.
- `opengame stats --csv <file>` writes the week's figures as the CSV the Stats tab
  downloads, from the same export. It never writes over an existing file.
- Ships the skills from `@opengamehq/skills` 1.3.0.

## 0.6.0

- `opengame releases` lists a game's releases, newest first, as the Releases tab on its
  page does: which one is live, which were live before, which are drafts or in review,
  which were cleaned up, and which can be made live again.
- `opengame rollback <release>` makes a release that was live before live again, through
  the same check and audit as Make live again on the website. A person is asked first; an
  agent or a script passes `--yes`. It needs a token with the `submit` permission, which
  `opengame login` gives.
- Ships the skills from `@opengamehq/skills` 1.2.0.

## 0.5.0

- Before OpenGame opens for creators, a refused command names the day it opens ("OpenGame
  opens for creators on 18 November") rather than saying it is not launched.
- `opengame deploy` returns `gameOrigin`, the origin the published game runs at, and says
  to allow that exact origin when the game's own servers check `Origin` or send CORS
  headers.
- `opengame pull` names the website setting opengame.json cannot hold, such as a player
  count it has no room for, and the way past it, rather than a general manifest error.
- `--help --json` no longer carries `internal: true`, and the local checker's failure no
  longer tells you to reinstall an internal CLI.
- Ships the skills from `@opengamehq/skills` 1.1.0.

## 0.4.0

- First release on npm. This version is published by hand and has no npm provenance
  statement; versions published from this repository's workflow will.
- Add the launch check and the `not_launched` exit code (7): when OpenGame has not opened
  for the account, a command that needs it says so and stops.
- `AGENTS.md` is in the package: the procedure a coding agent follows to deploy a game.
