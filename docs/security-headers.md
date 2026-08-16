# Security headers

Set in `firebase.json` under `hosting.headers`, applied to every response.

## Enforced

| Header                       | Why                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Strict-Transport-Security`  | One year, subdomains included. Hosting is HTTPS-only anyway; this stops the first request from being downgraded.                                                    |
| `X-Content-Type-Options`     | `nosniff`. The bundle is served from the same origin as user content will be once publishing exists.                                                                |
| `Referrer-Policy`            | `strict-origin-when-cross-origin`. A vocabulary URL contains a document id; it should not travel to another site in full.                                           |
| `Permissions-Policy`         | Everything the app does not use, denied. Speech synthesis needs no permission — it is output, not `microphone`.                                                     |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups`, **not** `same-origin`. Firebase Auth signs in through a popup, and the strict value severs the handle it posts its result back through. |

## Content-Security-Policy is Report-Only, on purpose

A wrong CSP does not degrade — it breaks sign-in, and it breaks it _after_ deploy,
for users who then cannot get in to report it. Report-Only publishes the same
policy, blocks nothing, and reports violations to the browser console.

Promote it to the enforcing header once a real sign-in, a real Google avatar
load and a real Firestore round trip have all been performed against a deployed
build with the console open, and nothing was reported.

`frame-ancestors 'none'` is the reason there is no `X-Frame-Options`: it is the
same protection, and CSP supersedes it — but **while the policy is Report-Only
it enforces nothing**, so this is one of the things promotion turns on.

The `connect-src` list is the minimum Firebase Auth and Firestore need.
`https://lh3.googleusercontent.com` in `img-src` is the Google profile picture;
drop it if the avatar is ever rendered from initials only.
