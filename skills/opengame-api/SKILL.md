---
name: opengame-api
description: Call the OpenGame creator API directly over HTTPS. Covers the base URL, creator tokens and scopes, the OpenAPI document, the error shape and retry fields, deploying without the CLI, and checking whether OpenGame is open. Use when the person wants to deploy from their own tool or CI without the CLI, asks about the OpenGame REST API, api/v1, openapi.json or a creator token, or an API call returned an error code you need to read.
metadata:
  version: "1.0.5"
---

# Call the OpenGame creator API

OpenGame opens on 18 November 2026, and the creator API on 18 November. Until 18 November, every route except the status route and sign-in answers 403
with the error `not_launched` and the message "OpenGame opens for creators on 18 November." for any account
outside the OpenGame team. Check before anything else:

```bash
curl -s https://opengame.io/api/v1/status
```

It answers `{ "launched": false, "access": null }` before launch. Sent with a token,
`access` says whether that account may use OpenGame now. Do not retry a
`not_launched` refusal in a loop; tell the person.

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

1. `POST /api/v1/deploys` with the archive's size, file count, SHA-256 hash and manifest, and
   an `Idempotency-Key`. Save the operation ID and the key before uploading.
2. `PUT` the archive bytes to the returned `upload` URL with the headers it names, and
   no creator token.
3. `PUT /api/v1/operations/{id}/upload` to confirm. A `POST` to the same path gives a
   fresh upload URL if the upload was interrupted.
4. Poll `GET /api/v1/operations/{id}` until it is `ready`, `failed` or `expired`.

Reuse one `Idempotency-Key` for every retry of the same deploy; a new key starts a new
operation. Submitting a release to review is separate: `POST /api/v1/submissions`.

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

- `not_launched` (403): OpenGame has not opened yet for this account.
- `not_member` or `account_inactive` (403): the account has no access, or is suspended.
- `uploads_closed` (403): new uploads are not open to this account; nothing started.
- `entries_closed` (403, `retry` is `never`): entries have closed, so no game can be
  deployed or updated. Published games stay live. Do not retry; tell the person.
- `upload_expired`: start a new deploy with a new `Idempotency-Key`.
- A path that is not a route gets 404 `not_found`; a method a route does not take gets
  405 with no JSON body, so check the status before parsing.

Rate limits and bundle limits change; read them with `GET /api/v1/limits` or
`opengame limits --json` rather than from a page.
