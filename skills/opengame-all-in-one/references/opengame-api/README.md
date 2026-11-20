> Carried from `opengame-api` 1.0.9. Read it when: Call the OpenGame creator API directly over HTTPS. Covers the base URL, creator tokens and scopes, the OpenAPI document, the error shape and retry fields, deploying without the CLI, and checking whether OpenGame is open. Use when the person wants to deploy from their own tool or CI without the CLI, asks about the OpenGame REST API, api/v1, openapi.json or a creator token, or an API call returned an error code you need to read.


# Call the OpenGame creator API

The creator API takes any signed-in account. Check before anything else:

```bash
curl -s https://opengame.io/api/v1/status
```

With no token it answers `"launched": true` and `"access": null`. Sent with a token, `access` says whether that account may use OpenGame now, and is `true` for any
account. Do not retry a `not_launched` refusal in a loop; sign in, or tell the person.

Most integrations should run the CLI (`opengame-cli`), which builds, checks, packages
and resumes uploads. Use the API when the CLI cannot run.

## Base URL and authentication

- Creator API: `https://opengame.io/api/v1`.
- Send a creator token as `Authorization: Bearer ...`. `opengame login` makes one with
  `read`, `deploy` and `submit` scopes; one made in the browser can have fewer scopes
  and be limited to one game. Give a job only the scopes it needs.
- Keep the token in the runner's secret store as `OPENGAME_TOKEN`. Never log it, put it
  in a command argument or ship it in a game. Send it only to the creator API: never
  to a storage upload URL.
- Refuse redirects on authenticated requests, so a token is never replayed elsewhere.

Check a token with `GET /api/v1/auth/me`, which returns the handle and the
credential's scopes.

A running game does not use this API. It talks to OpenGame through the SDK with a
session token the OpenGame page supplies (`opengame-sdk`).

## The contract

The OpenAPI document is `openapi.json` in the `opengamehq/opengame` repository and in
the docs' API reference. Each operation there lists its request, its responses and the
authentication it needs. Read it rather than guessing a field.

## Deploy without the CLI

Start with `GET /api/v1/bootstrap`. It returns the limits, the account's usage and
`capabilities`, which say what this account may use now: `archiveParts` (an archive in
parts), `incrementalUpload` (file by file), `fileParts`, `filePacks` and `externalAssets`.
Use a way of uploading only when its capability is `true`.

An archive deploy:

1. `POST /api/v1/deploys` with the archive's size, file count, SHA-256 hash and manifest, and
   an `Idempotency-Key`. Save the operation ID and the key before uploading. Add
   `"multipart": true` to send an archive over 64 MiB
   in parts: the answer then carries `multipart` (the part size, the part count and the
   parts already stored) in place of `upload`. Without it, an archive over
   500 MiB is refused with 413 `bundle_limit`.
2. One `PUT` of the archive bytes to the returned `upload` URL, with the headers it names
   and no creator token. In parts: `POST /api/v1/operations/{id}/upload/parts` with
   `{"parts": [1, 2, ...]}` (up to 64 a
   request) signs a URL for each, then `PUT` each part to its URL, up to
   16 at once.
3. `PUT /api/v1/operations/{id}/upload` to confirm. A `POST` to the same path gives a
   fresh upload URL, or for parts the ones storage already holds, if the upload was
   interrupted.
4. Poll `GET /api/v1/operations/{id}` until it is `ready`, `failed` or `expired`.

A file-by-file deploy sends only the files OpenGame does not already hold, so a small
change to a big game uploads little. `POST /api/v1/deploys/files` starts it from a list of
files with their hashes, the `/api/v1/operations/{id}/files/...` routes sign, verify and
pack the missing ones, and `POST /api/v1/operations/{id}/files/complete` assembles the
build and queues the checks. The request bodies are in `openapi.json`.

Reuse one `Idempotency-Key` for every retry of the same deploy; a new key starts a new
operation. A ready deploy goes to review by itself. Once it passes, the creator confirms its
details on the deploy's page, or `POST /api/v1/submissions/{id}/publish` does with a token
holding `submit`. An update of a game that is already live publishes by itself.

An account may begin 5 deploys in any rolling 24
hours (429 `deploy_day_limited`), and has an hourly allowance too (429
`deploy_rate_limited`). A refused deploy uploads nothing; wait and try again.

## Errors

Errors are JSON with a stable `error` code and a `message` to show the person. Branch
on `error`. Other fields, when present:

| Field | Meaning |
| --- | --- |
| `retry` | `now`, `after-fix`, `later` or `never`. |
| `retryAfterSeconds` | How long to wait, on a rate limit. |
| `url` | The page where the fix happens. |
| `requestId` | Quote it when reporting a failure. |

Some answers to know:

- `not_launched` (403): the creator API is closed to this caller. Sign in.
- `not_member` or `account_inactive` (403): the account has no access, or is suspended.
- `uploads_closed` (403): new uploads are not open to this account; nothing started.
- `entries_closed` (403, `retry` is `never`): entries have closed, so no game can be
  deployed or updated. Published games stay live. Do not retry; tell the person.
- `upload_expired`: start a new deploy with a new `Idempotency-Key`.
- A path that is not a route gets 404 `not_found`; a method a route does not take gets
  405 with no JSON body, so check the status before parsing.

Rate limits and bundle limits change; read them with `GET /api/v1/limits` or
`opengame limits --json` rather than from a page.
