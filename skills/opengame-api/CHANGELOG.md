# opengame-api changelog

## 1.0.9

OpenGame is open: `GET /api/v1/status` is shown answering `launched: true`, and `not_launched` is described without a launch date. (19 Nov 2026)

## 1.0.8

A release that passed review is published with `POST /api/v1/submissions/{id}/publish`, as well as on the deploy's page, and an update of a live game publishes by itself (16 Nov 2026).

## 1.0.7

Deploying without the CLI starts from `GET /api/v1/bootstrap` and its capabilities. An archive over 500 MiB goes in parts (`"multipart": true` and `/api/v1/operations/{id}/upload/parts`) or is refused with 413 `bundle_limit`, and a file-by-file deploy (`/api/v1/deploys/files`) sends only the files OpenGame does not already hold. Names the daily deploy allowance, 5 in any rolling 24 hours (`deploy_day_limited`), beside the hourly one. A ready deploy goes to review by itself.

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
