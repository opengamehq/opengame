# opengame-api changelog

## 1.0.6

Any signed-in account can use the CLI, the creator API, uploads and jam entries before launch, so a `not_launched` answer means the request came with no account: sign in (`opengame login`) and run it again rather than waiting for 18 November.

## 1.0.5

OpenGame opens on 18 November 2026, the jam's kickoff, not 17 November: the site no longer opens a day before the rest.

## 1.0.4

The site opens on one day and the CLI, uploads and the creator API on the next, the jam's kickoff. Until then an account outside the team is told that day, read from the launch clock.

## 1.0.3

Names the day OpenGame opens, read from the launch clock.

## 1.0.2

Names `entries_closed`, which every deploy path answers once entries close.

## 1.0.1

The note about launch no longer prints a date, which lives only in the launch clock.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
