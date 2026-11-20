# opengame-sdk changelog

## 1.0.16

OpenGame is open: the opening no longer quotes the pre-launch refusal. (19 Nov 2026)

## 1.0.15

Kaigen doesn't read `og.invite.code` yet, so a Kaigen game's players join through Kaigen Online's session list and friend invites. (18 Nov 2026)

## 1.0.14

Unreal Engine 5.9: C++ calls the `window.OpenGame` that OpenGame adds to every threaded page, inside `MAIN_THREAD_EM_ASM`, which runs on the page's thread and waits for it to read any string argument. (17 Nov 2026)

## 1.0.13

Invite links: `og.invite.link(code)` is the game's page on opengame.io with `?join=CODE`, and `og.invite.code` is the code a player arrived with, so a game's own lobby links open on OpenGame and drop the friend straight into the lobby.

## 1.0.12

Profile sharing is no longer a setting: every signed-in player with a handle sends their handle, number and OG, and they are null for a guest, an account without a handle and a private preview. Any signed-in account can deploy, so only a CLI with no login hears that OpenGame is not open yet. The docs at docs.opengame.io are public, and the skill links them by address.

## 1.0.11

Pause in a shared online match stops the player's own input and sound rather than the match, and points to `opengame-multiplayer` for how a host hands over.

## 1.0.10

og.player.stats() reads the player's own entry on every board in one request, a career board's row for all runs included, so XP and levels can be read back into a game. Higher event and score budgets, up to 25 boards a game, and no need to credit OG Radio's music.

## 1.0.9

OG Radio: `og.radio` and its drop-in picker, so players can pick stations and songs in a game's menu and listen while they play. Sound needs the player's press and stays off while the game is muted. A new reference, `references/radio.md`, has the calls, scopes, theming and codes.

## 1.0.8

The site opens on one day and the CLI, uploads and the creator API on the next, the jam's kickoff. Until then an account outside the team is told that day, read from the launch clock.

## 1.0.7

Leaderboards cover runs: `board.submitRun` with stats and tags, `top`, `me` and `around` with a sort, a filter and an offset, the `ignored` list on a receipt, and the `invalid_run` and `invalid_query` results.

## 1.0.6

Every name the game asks this player for or shows as theirs, such as a call sign, trainer name or player name, starts as their handle, keeps a name they saved, and keeps the game's own default otherwise. The local stand-in is described as `opengame dev`'s, which it is. This is now a high rule with an example, a common mistake and a check.

## 1.0.5

Until the SDK is on npm, the install step tells the agent to stop when the game has no copy and send the creator to team@opengame.io for one, rather than writing in itself.

## 1.0.4

The install step follows whether the SDK is on npm: until it is, it says to write to team@opengame.io for a copy.

## 1.0.3

The note about launch no longer prints a date, which lives only in the launch clock. It no longer says the local stand-in refuses to start before launch, which the SDK does not do.

## 1.0.2

Describe only what the SDK provides.

## 1.0.1

Use the public npm SDK installation instructions.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
