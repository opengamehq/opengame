# opengame-jam changelog

## 1.1.0

The entry is made with `opengame publish --track ... --models ...` when the person asks, or on the deploy's page. Nobody certifies anything to enter (16 Nov 2026).

## 1.0.9

No person reviews a game: review starts by itself once a deploy is ready, then either lets it through or returns it with the reason. The person enters the jam on the deploy's page (Confirm details: the track, the models, any sponsor track, then certify), and `opengame submit` is no longer the way in, since it cannot confirm a release its deploy already sent to review. While the jam runs, a new original game goes on OpenGame only as a jam entry, up to the account's allowance, unless the account is an admin or an approved publisher; mods and decomps go on under Just for fun at any time; after the close anyone can publish to the gallery. A sponsor track asks for the email of the account used there, not an evidence note. After the close an entered game keeps the version that was live then.

## 1.0.8

Any signed-in account can use the CLI, the creator API, uploads and jam entries before launch, so a `not_launched` answer means the request came with no account: sign in (`opengame login`) and run it again rather than waiting for 18 November.

## 1.0.7

A build can be 4 GiB zipped, 5 GiB unpacked and 25,000 files, from 1 GiB, 1.5 GiB and 10,000 files. OpenGame opens on 18 November 2026, the jam's kickoff, not 17 November: the site no longer opens a day before the rest.

## 1.0.6

The site opens on one day and the CLI, uploads and the creator API on the next, the jam's kickoff. Until then an account outside the team is told that day, read from the launch clock.

## 1.0.5

A build can be 1 GiB zipped and 1.5 GiB unpacked, from 500 MiB and 1 GiB.

## 1.0.4

Names the days OpenGame opens and jam entries open and close, read from the launch clock.

## 1.0.3

The note about launch no longer prints a date, which lives only in the launch clock.

## 1.0.1

Shorter note on what a jam game may call at runtime.

## 1.0.0

First public release, in the opengamehq/opengame repository and the OpenGame CLI.
