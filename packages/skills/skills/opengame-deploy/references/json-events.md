# Reading the CLI's JSON

With `--json` every line of output is one JSON object. Four kinds can appear before the
last line, and the last line is always a `result` or an `error`.

| `type` | Meaning | What to do |
| --- | --- | --- |
| `progress` | A stage started or moved on: `build`, `check`, `upload`, then the server's own stages for the deploy, `certify` and `review:<state>` for a submit, `approval` for a login | Nothing; it is a heartbeat |
| `notice` | Something the person should know: excluded files, kept website metadata, a resumed upload, a sign-in URL | Read `code` and `message`; pass sign-in and kept-metadata notices on |
| `finding` | One problem in the game or one check that could not decide | Fix or report it, by its `fault`, `certainty` and `retry` |
| `result` | The command finished; `data` holds its answer | Read `data` |
| `error` | The command stopped; `code`, `message`, `exitCode`, `retry`, and `next`, `retryAfterSeconds` or `finding` when they apply | Run `next` when there is one; otherwise act on the exit code below |

## Exit codes

| Code | Meaning | What an agent does |
| --- | --- | --- |
| 0 | Done | Read the result |
| 1 | A check failed | Fix the findings, run `opengame check`, then deploy again |
| 2 | Input missing or invalid | The message names the flag or value to supply |
| 3 | Not signed in, or the token lacks permission. A login waiting for approval also exits 3, with code `login_pending` | `login_pending`: show the person the URL and code, then run `next` (`opengame login --continue`) until it exits 0. Otherwise `opengame whoami`, then `opengame login`, or ask for a token with the right scope |
| 4 | Rate limited | Wait `retryAfterSeconds` if the error has it, otherwise a few minutes, then run the same command once. Do not loop |
| 5 | Our side failed, or a local file could not be read or written | The game is fine. Retry later; never change the game for this |
| 6 | This CLI is too old for the server | Run `next`, which is `opengame upgrade`. Signed out, run `opengame login` first; it works on this version |

## A worked repair

A game whose `index.html` loads `./Game.js` while the file on disk is `game.js`. It runs
on the creator's Mac, because the Mac's file system ignores case, and is a missing file for every
player. `opengame check . --json` printed, from a real run:

```json
{"type":"finding","finding":{"release":null,"check":"case-mismatch","checkVersion":"packaging@1","state":"failed","certainty":"certain","fault":"game","evidence":{"observed":"index.html line 1 asks for Game.js, but the file is game.js.","file":"index.html:1"},"fix":"macOS and Windows do not care about capitalisation. The servers that hand your game to a player do. So this loads on your machine and the file is missing for everybody else. Fix the reference or rename the file so the two match exactly.","verify":"opengame check, then opengame deploy","retry":"after-fix"}}
{"type":"finding","finding":{"release":null,"check":"platform-engine","checkVersion":"packaging@1","evidence":{"observed":"Could not confirm Three.js in this build."},"state":"inconclusive","certainty":"heuristic","fault":"unknown","fix":"The build can proceed. A reviewer will confirm the engine before publication. Nothing has to change now; you can deploy as it is.","verify":"opengame deploy","retry":"never"}}
{"type":"error","code":"check_failed","message":"This build has blockers. Fix them, then run opengame check again.","exitCode":1,"retry":"after-fix"}
```

Reading it:

1. The first finding is `failed`, `certain` and `fault: "game"`, so it is the game's to
   fix. `evidence.file` says `index.html:1`. Change `./Game.js` to `./game.js` there
   (or rename the file), then run what `verify` says.
2. The second finding is `inconclusive`, `heuristic` and `fault: "unknown"`, with
   `retry: "never"`. It does not block anything. Do not add a fake Three.js import to make
   it go away; a person confirms the engine.
3. After the fix, `opengame check . --json` ends in a `result` and exits 0.

## Findings that are ours

A finding with `fault: "platform"`, or an error with exit code 5, means a scanner, the
test machine, a moderation provider or storage failed. The CLI says so in plain words.
Leave the game alone, wait `retryAfterSeconds` when the finding or error has it (a few
minutes when it does not), and run the same command again. Rewriting a working game to satisfy a broken check is the failure this rule
exists to prevent.

## Results worth keeping

- `deploy`: `operationId`, `state` (`uploading`, `queued`, `checking`, `ready`,
  `failed`, `expired`), `gameId`, `releaseId`, `url`, and `timingsMs` when it finished.
  Keep `releaseId`: submitting names it.
- `check`: `files`, `bytes`, `excluded` and `findings`.
- `whoami`: the signed-in handle and the token's scopes.
