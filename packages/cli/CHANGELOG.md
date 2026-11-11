# Changelog

## 0.8.0

- `opengame init` guesses a genre from the title, the description, the page's meta
  description and package.json's keywords, as its help says. When none of those names a
  genre, it asks a person, and an agent or a script gets `puzzle-casual`, with the line to
  change it. It used to leave genre blank, and `opengame check` then refused the file.
- `opengame init` in a folder whose opengame.json leaves title, description, genre or
  controls blank fills those in and keeps everything the file sets. It used to stop because
  the file existed. A file with nothing blank is still refused, and a flag for a field the
  file already sets is named as unused.
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
