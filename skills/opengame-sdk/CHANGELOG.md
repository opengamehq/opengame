# opengame-sdk changelog

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
