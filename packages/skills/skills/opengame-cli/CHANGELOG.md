# opengame-cli changelog

## 1.8.1

OpenGame opens on 18 November 2026, the jam's kickoff, not 17 November: the site no longer opens a day before the rest.

## 1.8.0

`opengame init` asks a person only the game's name, and `opengame submit` sends a person with no jam answers to the deploy's page, where the description, genre and jam entry are filled in.

## 1.7.0

Teaches `opengame stats --csv`.

## 1.6.0

Teaches `opengame achievements` and `opengame achievements retire`.

## 1.5.0

Teaches `opengame delete`: only when the person asks for that game to be deleted, with the title they confirmed, and unpublish offered first.

## 1.4.0

Teaches `opengame jam withdraw` and `opengame jam reenter`.

## 1.3.0

Teaches `opengame details` and `opengame handle`: changing a game's words on the website, and renaming the person's handle with their go-ahead.

## 1.2.0

Teaches `opengame unpublish` and `opengame restore`: taking a game off the gallery and putting it back, only when the person asks.

## 1.1.0

Teaches `opengame releases` and `opengame rollback`: listing a game's releases and making one that was live before live again, only with the person's go-ahead.

## 1.0.4

The site opens on one day and the CLI, uploads and the creator API on the next, the jam's kickoff. Until then an account outside the team is told that day, read from the launch clock.

## 1.0.3

Until the CLI is on npm, the install step tells the agent to stop when `opengame` is missing and send the creator to team@opengame.io for a copy, rather than writing in itself.

## 1.0.2

Names the day OpenGame opens, read from the launch clock. The install step follows whether the CLI is on npm: until it is, it says to write to team@opengame.io for a copy, and it never prints an npm command for a package that is not there.

## 1.0.1

The note about launch no longer prints a date, which lives only in the launch clock, and names every command that answers before launch.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
