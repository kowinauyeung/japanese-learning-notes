# 語彙庭 Goitei — Japanese Vocabulary Notebook

A personal web app for recording and reviewing Japanese vocabulary picked up in
daily life and at work, with Cantonese translations and notes.

This repository began as 67 hand-written Markdown notes. The one-shot migration
into Firestore has finished, and Firestore now holds the live data. The original
Markdown, migration tooling and temporary import artefacts are no longer part of
the working tree.

## Features

### Available

- **Dashboard** — counts by week, month and year; a learning heatmap; JLPT and
  part-of-speech breakdowns; a word of the day; and the most recently learned
  entries.
- **Browse** — substring search over headwords, readings, definitions, examples,
  tags and notes, plus filters for JLPT level, part of speech, origin, style,
  frequency, tags and learning date range. Filter state lives in the URL, so a
  view can be bookmarked.
- **Entry detail** — furigana split per kanji run where the reading can be
  aligned, falling back to one annotation over the whole word where it cannot;
  senses, example sentences, usage notes and context sections.
- **Create / edit / delete** — a quick form and a detailed form, plus a JSON
  import path for assistant-generated entries.
- **Practice** — a setup screen (単語集, tag and JLPT chips, 品詞 and 語種, a learning-date
  range with 直近1週間 / 1ヶ月 / 1年 shortcuts, a 苦手な語のみ toggle and a live match
  count) that starts either a **flashcard** run or a **dictation** run. Flashcards flip
  to the meaning before offering もう一度 / わかった, and can be driven entirely from
  the keyboard — <kbd>Space</kbd> turns the card, <kbd>←</kbd> / <kbd>→</kbd> answer it,
  <kbd>Esc</kbd> asks to leave. Dictation speaks the word through the Web Speech API and
  marks what you type. A finished session is recorded once, and a word answered wrong
  turns up under 苦手な語のみ next time.

### Planned

Word sets and practice history are placeholder routes.

## Stack

| Layer       | Choice                                         |
| ----------- | ---------------------------------------------- |
| Build       | Vite 7                                         |
| UI          | React 19 + TypeScript (strict), React Router 7 |
| Styling     | Tailwind CSS 4                                 |
| Data & auth | Firebase — Firestore + Google sign-in          |
| Hosting     | Firebase Hosting                               |

Pure client-side app: the Firestore web SDK talks to the database directly, and
security rules — not a server — are what protect the data. The repository pages
its reads, but the provider walks every page on load and keeps the whole
collection in memory, so search, filtering and sorting run over that array with
no round trip. The design assumes a personal notebook, not a corpus.

## Getting started

```bash
yarn install
cp .env.example .env.development   # fill in your Firebase web config
yarn dev
```

`.nvmrc` and `packageManager` name what this is developed and built on — Node 24
and Yarn 1 — so `nvm use` and CI resolve to the same line. `engines` is a
separate, deliberately looser statement: the oldest Node the app is known to
work on, not the version to develop against. Pinning it exactly would fail
`yarn install` for anyone on a newer Node that runs the app perfectly well.

Pointing this at a fresh Firebase project takes a few more steps, in order:

1. Register a web app and enable Google sign-in.
2. [Create a Cloud Firestore database](https://firebase.google.com/docs/firestore/quickstart#create_a_cloud_firestore_database)
   — a new project has none — choosing a location and **Production mode**. Test
   mode leaves the data open to any client for its first 30 days.
3. Point the tooling at your project: change the `dev` alias in `.firebaserc`,
   or pass `--project <your-project-id>` instead of using the `rules:dev`
   script, which is wired to `goitei-dev`.
4. `yarn firebase login`, then deploy the rules with `yarn rules:dev` (once the
   alias points at your project) or
   `yarn firebase deploy --only firestore:rules --project <your-project-id>`.
5. Sign in once, then grant yourself access — the rules deny everything until
   your account carries the `allowed` custom claim. `yarn allow <your-email> --project <your-project-id>`
   sets it, and the account must have signed in
   before that, because the claim goes on the uid Google issued and there is
   nothing to set it on until then. The repository shortcuts still work too:
   omit `--project` for `goitei-dev`, or pass `prod` for `goitei`.
6. **Sign out and sign back in.** A claim reaches the client only in a freshly
   minted ID token, so the session you granted access to is still denied — for
   up to an hour, until its token expires on its own.

`firebase-tools` is a local devDependency, so the CLI is reached through
`yarn firebase …` unless you have installed it globally.

Step 3 only changes local configuration; nothing is enforced until step 4
deploys the rules successfully. After step 6 every read and write is scoped to
your account.

Step 6 is a step rather than a note because leaving it out looks exactly like a
broken build: every screen reports that it could not load, and running step 5
again changes nothing. `yarn allow` prints the account it granted, so the last
line of step 5 is not evidence that step 6 has happened.

`.env.development` and `.env.production` are gitignored. Their values ship inside
the JS bundle and are not secrets — Firestore rules are what enforce access — but
keeping them out of Git stops the two projects' configs from drifting into the
source tree.

### Scripts

| Command                                | What it does                                          |
| -------------------------------------- | ----------------------------------------------------- |
| `yarn dev`                             | Vite dev server (`.env.development`)                  |
| `yarn build`                           | Type-check, then build to `dist/` (`.env.production`) |
| `yarn preview`                         | Serve the existing `dist/` build locally              |
| `yarn typecheck`                       | The app, then `tsconfig.test.json`                    |
| `yarn test`                            | Unit, component, rules and adapter tests              |
| `yarn test:e2e`                        | Playwright: user flows and visual regression          |
| `yarn release`                         | Bump the version and write `CHANGELOG.md`             |
| `yarn rules:dev` / `yarn rules:prod`   | Deploy `firestore.rules`                              |
| `yarn auth:login` / `yarn auth:revoke` | Repo-local Google ADC, used by the operator scripts   |

`yarn auth:login` writes to `.gcloud/` via `CLOUDSDK_CONFIG`, deliberately apart
from the machine-wide `~/.config/gcloud`. There is no long-lived service-account
key in this project, and there should not be one.

## Tests

Six layers, split by what each one needs to run rather than by what it covers.
[`CLAUDE.md`](CLAUDE.md) has the rules for choosing between them and for writing
new ones.

| Command                   | Covers                                                                                                                     | Needs    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| `yarn test:unit`          | `tests/unit` — coercion, filters, dates, furigana, import, redirects; `tests/component` — rendered DOM                     | nothing  |
| `yarn test:emulator`      | `tests/rules` — who may read and write what; `tests/integration` — the Firestore adapter's queries, cursors and timestamps | JDK 21   |
| `yarn test:e2e`           | `tests/e2e` — sign-in, browse, create, edit, delete; offline navigation; four screenshot baselines                         | Chromium |
| `yarn test:visual:update` | Regenerates those baselines                                                                                                | Docker   |
| `yarn coverage`           | Reported, never enforced                                                                                                   | nothing  |

Four things worth knowing before adding to it:

- **The end-to-end build does not touch Firebase.** `vite build --mode e2e`
  aliases `src/lib/backend.ts` to an in-memory twin, so Playwright is
  deterministic and needs no emulator or Google popup. Firestore is covered
  where it can be asserted precisely instead — `tests/integration` for the
  adapter, `tests/rules` for the boundary.
- **The service worker has a second build of its own.** `--mode e2e` ships none
  on purpose, so `vite build --mode e2e-pwa` produces the same in-memory app with
  the worker left in; `yarn test:e2e` builds and serves both, and
  `tests/e2e/offline.spec.ts` is the only spec that runs against the second.
- **Screenshot baselines are Linux-only.** They are generated in the same
  container image CI runs, because macOS renders Japanese glyphs differently.
  The visual specs skip themselves anywhere else and say so.
- **The emulator is a Java process** and `firebase-tools` requires **JDK 21 or
  newer**. Installing it is not enough if an older JDK comes first on `PATH`,
  which is the usual state on macOS:

  ```bash
  export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
  export PATH="$JAVA_HOME/bin:$PATH"
  ```

  Both lines are needed. Setting `JAVA_HOME` alone leaves the older `java` first
  on `PATH`, and `firebase-tools` runs that one — the emulator then refuses to
  start with a version error that reads as if nothing were installed.

CI runs the three suites as separate jobs, so a red tells you which boundary
broke: `verify` (typecheck, lint, format, build, unit), `emulator`, and `e2e`.

## Environments

`.firebaserc` maps `default` and `dev` to `goitei-dev`, and `prod` to `goitei`,
so a deploy with no `--project` targets development. Branches follow the same
split — `develop` for dev, `main` for production. Both are protected: changes
land through a pull request with a green CI run, and neither accepts a force
push.

Pushing to `develop` deploys hosting and Firestore rules to `goitei-dev`, and a
pull request gets its own Hosting preview channel that expires after seven days
— every pull request except one into `main` or a `release/**` branch, which get
CI and no preview. The deploy job checks out the pull request's base, so it
needs a base that carries the toolchain, and a release into `main` is the one
case that does not.

Preview channels are hosting-only: rules are project-wide, so deploying them
from a pull request would change the rules every other preview runs under.
A preview reads the real `goitei-dev` data, not a copy.

**Production is a button, not a branch.** Run _Deploy (production)_ from the
Actions tab and give it the full 40-character SHA; the workflow refuses any
commit that is not an ancestor of `origin/main`, and the `production`
environment is where a required reviewer or a wait timer is configured. A push
to `main` is a merge, and a merge is not a decision to release.

Which project a build talks to comes from the env file Vite picks, not from the
`--project` flag, so a by-hand deploy must set the two together:

```bash
# dev
yarn vite build --mode development
yarn firebase deploy --only hosting,firestore:rules --project dev
```

`firestore.rules` gives an account read and write over everything beneath its
own `users/{uid}`, and nothing else; every unlisted path is denied. Access is
gated on the custom claim `allowed`, which nothing but `yarn allow` sets, so
signups are closed until an operator grants it. Nothing in front of the site can
substitute for this: Hosting serves the config that reaches Firestore, so a
password on the HTML protects the page, not the data.

Rules deploy before anything that writes through them, so a new top-level field
is allowlisted before any client can send it. A client that ships a new field
before the rules that name it is denied by `hasOnly` until the rules follow;
the direction that really stays open is a looser product limit in the deployed
rules.

### Response headers

`firebase.json` sets two things on every response: the security headers, and a
caching rule. Two of Hosting's matching semantics decide how they have to be
written, and both were measured against the Hosting emulator rather than read
off the documentation.

**Every matching entry applies, and for a repeated key the last one wins.** So
the `**` block holding the security headers is not shadowed by the narrower
entries after it — an asset still carries the full set — and `/assets/**` gets
its `Cache-Control` only because it appears _after_ the `**` rule that sets
`no-cache`. Move it above and the assets silently fall back to revalidating on
every load.

**A header rule matches the request path, not the rewritten one.** `**` →
`/index.html` means `/` and `/browse` are served the index document, but a rule
whose `source` is `/index.html` reaches neither of them; nobody navigates to
`/index.html` by name. That is why the `no-cache` default is written against
`**` rather than against the three files that actually need it.

The result:

| Path            | `Cache-Control`                       | Why                                                                                                                                                                                                            |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/assets/**`    | `public, max-age=31536000, immutable` | Vite puts a content hash in the name, so a changed file is a changed URL and the old one is never requested again.                                                                                             |
| everything else | `no-cache`                            | `index.html`, the manifest, the icons and a future `sw.js` keep their names across deploys, so the only safe answer is to revalidate. `no-cache` stores the response and revalidates it; it is not `no-store`. |

`no-cache` as the default rather than a list of filenames is what makes this
survive the service worker: `/sw.js` is covered before it exists. Hosting's
default is `max-age=3600` on everything, which would otherwise pin a controlled
client to an hour-old app shell — and the scripts a worker `importScripts` come
from the HTTP cache even though the worker script itself does not.

**A pull request cannot verify this on its own preview.** The deploy job checks
out the pull request's base, so a preview channel runs the base branch's
`firebase.json`. Check header changes against the Hosting emulator locally, and
confirm them on `goitei-dev` after the merge:

```bash
yarn build:e2e
yarn firebase emulators:exec --only hosting --project demo-goitei \
  'curl -sI http://127.0.0.1:5010/ | grep -i cache-control &&
   curl -sI "http://127.0.0.1:5010/$(cd dist && ls assets/*.js | head -1)" | grep -i cache-control'
```

`emulators:exec` and not `emulators:start`: the latter runs in the foreground
until it is interrupted, so anything written after it never runs. Check a file
under `/assets/**` as well as `/` — that is the pair the ordering rule above
decides, and checking only one of them would pass with the rules reversed.

The port is pinned in `firebase.json` rather than left to default to 5000, which
macOS hands to AirPlay Receiver; the emulator then shifts to another port and a
hardcoded URL in a script fails for a reason that has nothing to do with what it
is testing.

### The service worker

`vite-plugin-pwa` precaches the built output — the shell, the CSS, the icons,
the manifest and **every route chunk**. The chunks are not an optimisation here:
every route in `src/router.tsx` is a `lazy: () => import(...)`, so a shell
without them reaches no screen at all. `navigateFallback` is `/index.html`,
matching the rewrite in `firebase.json`; `/__/*` is denied, because Firebase
serves `signInWithPopup`'s handler from there and answering it with the index
document would break sign-in with nothing naming the cause.

Settings live in `pwa-config.ts` rather than inline in `vite.config.ts`, so
`tests/unit/pwaConfig.test.ts` can read them back. Every failure they guard is
silent — a build succeeds either way.

**It is off under `mode === 'e2e'`.** A worker that precached the previous build
serves it to Playwright, and the suite then passes against code that is not the
code under test. That is the one failure here that would make every other test
in this repository green and meaningless.

**`mode === 'e2e-pwa'` is the deliberate exception**: the same in-memory build
with the worker left in, so the offline behaviour below can be checked by
something other than a person. It gets its own output directory, its own preview
server and its own Playwright project, and one spec runs there. The hazard above
does not follow it, which was measured rather than assumed — a fresh
`chromium.launch()` starts from an empty profile, so nothing survives from one
run to the next.

#### What it changes about deploying

Before the worker, a client running a stale build fixed itself: the next load
fetched a new `index.html` and the new chunk names came with it. It does not any
more. A controlled client keeps being served the precached build until it is
told to take a new one — so **reloading is no longer the fix**, and a support
reply that says "try reloading" is now advice that cannot work.

What ends it is the prompt. `skipWaiting` and `clientsClaim` are both off, so a
new build installs and waits rather than replacing the assets under a running
session — which would hand a page mid-practice a chunk from a bundle its loaded
code was never compiled against. `UpdatePrompt` offers the swap and the reader
takes it, or does not. A reader who keeps choosing "Later" stays on the old
build, deliberately: old and working beats new and halfway.

The consequence for a release is that **the deployed commit and the running
commit are now different questions**. The footer's build line answers the second
one, which is the one a bug report is actually about.

#### Checking it

`tests/e2e/offline.spec.ts` does, in the `chromium-pwa` project — `yarn test:e2e`
runs it with everything else. What it pins, and what is worth knowing before
reading it:

- `navigator.serviceWorker.ready` resolves with the worker in state
  `activating`, not `activated`, and the precache is already full at that point;
- the worker does **not** control the page that installed it. That is
  `clientsClaim: false` behaving correctly, not a failure — control begins at the
  next navigation, which is also why an installed window works: the process the
  reader sees is never the one that installed the worker;
- with the network off, `/`, `/vocabulary` and a deep route such as
  `/practice/dictation` all render, and the manifest is still served.

A `fetch` issued from the installing page still goes to the network and fails
offline. That is not a defect and the spec navigates first for the same reason
the app does.

Installability is Chrome DevTools → Application → Manifest on a deployed build.
Headless Chromium does not fire `beforeinstallprompt`, so that half needs a real
browser against the dev site or a preview channel.

### Operator runbook

Everything below assumes `GOOGLE_APPLICATION_CREDENTIALS`, or `gcloud auth
application-default login` against the right project.

**Granting access.** `yarn allow you@example.com prod` targets the repository
production project, and `yarn allow you@example.com --project your-project-id`
targets any other Firebase project. The account must have signed in once first
— the claim is set on the uid Google issued, so there is nothing to set it on
before that. Anything other than `prod`, `--project <project-id>` or
`--revoke` is rejected rather than ignored.

**Revoking it.** `yarn allow you@example.com prod --revoke`. **This lands within
the hour, not on the keystroke.** The claim lives inside the ID token the client
already holds and Firestore rules have no revocation check, so it keeps working
until that token expires. Revoking the refresh tokens ends the session at the
next refresh but does not shorten that window. When responding to abuse, delete
the data — that part takes effect now.

**Releasing.** Cutting the version — the branch, the changelog and the tag — is
[docs/releasing.md](docs/releasing.md). What follows is only the access half of
it, which has an order that matters. Three steps:

1. `yarn allow <email> prod` for every account that must keep working.
2. Ask each of them to sign out and sign back in. A claim reaches the client
   only in a freshly minted ID token; an open session picks it up at its next
   refresh, which is up to an hour away.
3. Run _Deploy (production)_.

The order is not a preference. The workflow deploys rules before hosting on
purpose, so a new top-level field is allowlisted before any client can send it
— and because the rules being deployed require a claim that no token issued
before step 1 carries. Reversing steps 1 and 3 locks out everyone who was
already signed in, for up to an hour, including whoever is doing the deploy.

This matters most exactly once: the first production run of that workflow _is_
the migration onto the claim.

### Deploy credentials

The dev workflow authenticates through Workload Identity Federation, so there is
no long-lived service-account key anywhere in this project. It needs these
repository secrets:

| Secret                           | What it is                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name, `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`                              |
| `GCP_DEPLOY_SERVICE_ACCOUNT`     | Email of the service account the workflow impersonates                                                                                           |
| `VITE_FIREBASE_*` (six)          | Same values as `.env.example`. Vite inlines them at build time; they are public by design, but the repo is public too, so they are not committed |

#### Setting them up

The identity is a Workload Identity Federation pool and provider in the Google
Cloud console, restricted to this repository, plus a service account the pool is
allowed to impersonate. No key is created at any point — that is the whole
reason for federating rather than downloading one.

Three things about it are worth writing down, because each was learned by
hitting it:

- The service account needs **Service Usage Consumer** on top of Firebase
  Hosting Admin and Firebase Rules Admin. Before deploying rules,
  `firebase-tools` checks that `firestore.googleapis.com` is enabled, and that
  check needs `serviceusage.services.get`. Without it the deploy stops on
  `403 Permission denied to get service [firestore.googleapis.com]`, which reads
  like a Firestore problem and is not one.
- The service account also needs **Firebase Authentication Admin**
  (`roles/firebaseauth.admin`), for preview sign-in below. Without it the deploy
  and the preview both still succeed and only Google sign-in fails, on a domain
  that exists for a week — the failure that is easiest to mistake for a bug in
  the branch under review.
- The provider's attribute condition matches on `assertion.repository` and stops
  there, deliberately. Narrowing it further is the obvious-looking improvement
  that breaks previews — see the trust boundary below before changing it.
- Production should get its own pool, provider and service account in `goitei`,
  and its own secrets under different names. Reusing the dev secret names is how
  a production build quietly ships against the dev Firestore. Until that exists,
  deploy production by hand.

  A pool is a project-scoped resource but is not confined to one: a service
  account in `goitei` could be bound to the `goitei-dev` pool through
  `roles/iam.workloadIdentityUser`, which is granted on the service account
  rather than on the pool. Keeping them separate is a choice — it gives
  production an independent trust anchor, so loosening the dev provider's
  attribute condition cannot reach production. The procedure is reusable; the
  resources are not.

#### Preview sign-in

A preview channel is served from `goitei-dev--pr-<n>-<hash>.web.app`, and
Firebase Auth refuses to complete a Google sign-in from an origin that is not on
its authorized domain list. The hash is generated per channel, so every pull
request lands on a hostname nobody has authorized, and the list accepts no
wildcard.

`firebase hosting:channel:deploy` handles both halves of that on its own. It
adds the new channel's hostname to the list, and it prunes every `goitei-dev--`
hostname no live channel claims, unless it is asked not to with
`--no-authorized-domains`. Nothing in this repository reimplements either.

**It needs `roles/firebaseauth.admin` to do it, and says almost nothing when it
cannot.** Without the role the call fails, firebase-tools logs a warning and
reports a successful deploy, and `--json` — which `deploy-dev.yml` passes to
read the channel URL — suppresses the warning too. That is not a hypothetical:
it is how preview sign-in came to be broken for weeks with every check green,
and why reviewers were adding hostnames by hand.

So `deploy-dev.yml` ends with a step that reads the authorized domain list back
and fails the job when the hostname it just deployed is missing. Two things
cause that, and neither surfaces any other way: the role being revoked, and two
channel deploys overlapping — the CLI reads the list, appends and writes it
back, and the admin API has no etag between the read and the write, so the later
writer drops the earlier one's hostname. A re-run of the job repairs both.

`preview-cleanup.yml` deletes the channel when its pull request closes. The
hostname goes with it — `hosting:channel:delete` removes it from the authorized
domain list as part of deleting the channel — and without this the channel would
linger its full seven days, with the hostname trusted for authentication that
whole time.

That removal fails the same quiet way the addition does, so the workflow reads
the list back and fails when a hostname belonging to the closed pull request is
still on it. It does not remove the hostname itself: a second writer on a list
whose API has no etag is a way to lose a domain rather than a way to remove one.
The next preview deploy prunes it, which is what makes a re-run of the job go
green.

Building previews with `yarn build:e2e` would sidestep all of this — the
in-memory adapters sign a user in without Google — and it is the wrong trade.
The preview exists to show the branch against real `goitei-dev` data; a
Firestore query, index or cursor defect is invisible against fakes, and that is
the class of defect that has actually reached review here.

#### Preview App Check

A preview channel cannot pass reCAPTCHA v3 attestation, which is a different
problem from the sign-in one above even though both come from the same hashed,
per-pull-request hostname. reCAPTCHA v3 site keys are registered against
specific domains in the reCAPTCHA admin console — not Firebase's authorized
domain list, and not anything `firebase hosting:channel:deploy` touches — so
nobody has ever added a preview's hostname there. If App Check enforcement is
on for Firestore, Authentication or Firebase AI Logic, every request from a
preview is refused.

That refusal is silent in the same shape the sign-in failure would have been:
the app loads, every Firestore read comes back `permission-denied`, and
nothing on screen says why. `src/infra/firebase/client.ts` documents the two
tells — an App Check failure logs a warning prefixed `@firebase/app-check` in
the browser console; a missing claim logs nothing — because a reader who does
not already know App Check exists has no reason to suspect it.

`admin/mint-preview-app-check-token.ts` works around this from the trusted
side instead. During `deploy-dev.yml`'s preview deploy, after
`google-github-actions/auth` and before `firebase hosting:channel:deploy`
uploads `dist/`, it uses the Admin SDK to mint a real App Check token for the
web app and stamps it into the built `index.html` as
`window.__APP_CHECK_PREVIEW_TOKEN__`. The Admin SDK needs no attestation of
its own — holding Google credentials for the project is already what
reCAPTCHA exists to prove — so this sidesteps the domain problem instead of
solving it. `client.ts` reads that value before any module script runs and
uses it through a `CustomProvider`, ahead of the ordinary reCAPTCHA path.

**Needs `roles/firebaseappcheck.admin`** (or an equivalent role) on the
deploying service account, the same shape of requirement `roles/firebaseauth.admin`
is above. This has not been exercised against a live project as of this
mechanism's introduction. If it is missing, `createToken` fails and the step
fails the job — deliberately not a warning-and-succeed, because a preview that
looks deployed and cannot attest is a worse outcome than a red check, which is
the exact lesson the sign-in incident above already paid for.

The token is public from the moment the preview is live — it sits in the page
source anyone loading the channel can read — which is the same exposure the
`yarn dev` debug token already accepts, just no longer confined to one
developer's machine. `--ttl-days` bounds it to the channel's own `--expires
7d`, and `preview-cleanup.yml` deleting the channel does not revoke a token
already handed out; it stays valid for whoever has it until it expires on its
own. Accepted because App Check is additive bot/abuse protection here, not the
authorization boundary — Firestore security rules are, per this repository's
testing rules — and because it is scoped to a pull request preview against
`goitei-dev`, never production.

#### Trust boundary

The deploy workflow is split into jobs, and the split is the security boundary
rather than a build-time optimisation:

- **`build`** runs the pull request's own code. It has `contents: read` and
  nothing else — no `id-token` permission, so `ACTIONS_ID_TOKEN_REQUEST_TOKEN`
  is not in its environment and nothing it runs can mint a Google credential.
  It uploads `dist/` and stops.
- **`deploy`** holds the credentials and runs no code from the pull request. It
  checks out the base branch, installs `firebase-tools` from a lockfile that is
  already merged, and takes only `dist/` from the build job.

A pull request is otherwise a code-execution primitive: `yarn install` runs
whatever `postinstall` the branch's lockfile asks for, before any file in the
diff has been read by a human. Keeping that away from the credential is what
the split buys.

The six `VITE_FIREBASE_*` values are the exception, and are scoped to the build
step. They can already be read out of the deployed bundle by anyone, so a build
that leaks them gives away nothing that visiting the dev site would not.

The provider's attribute condition is `assertion.repository` only, and stopping
there is deliberate. Adding `&& assertion.ref == 'refs/heads/develop'` does stop
a token minted in a pull request context from being exchanged — and with it,
every preview deploy, because pull-request tokens carry
`ref = refs/pull/<n>/merge`. That is not defence in depth; it switches the
feature off.

The tightening that costs nothing is two service accounts instead of one, bound
through the pool's `attribute.event`: `push` gets hosting **and** rules admin,
`pull_request` gets hosting admin only. A preview then cannot touch rules even
if something goes wrong upstream of it. Worth doing if this workflow ever grows
past one environment.

## Data model

Defined in [`src/domain/`](src/domain/), which holds no vendor imports at all —
`src/infra/firebase` is the only place that touches the Firestore SDK, and an
ESLint rule enforces it. Points worth knowing:

- A new entry requires `headword` and `definition`. `definition` is the only
  required explanatory field and is not tied to a language; the migrated entries
  keep their Cantonese gloss in `definitionSub`.
- `pos` is an array — plenty of entries are compound (名詞／動詞).
- Tags allow letters, digits and underscore only (`/^[\p{L}\p{N}_]{1,32}$/u`),
  so kanji are fine but spaces and punctuation are not.
- `learnedOn` is an editable `YYYY-MM-DD` date. It drives the week/month/year
  counts, the heatmap and the recent list; the JLPT and part-of-speech
  breakdowns read their own fields. `createdAt` is written once, `updatedAt` on
  every save. All three are plain ISO strings; the Firestore `Timestamp` is
  converted at the adapter boundary and never enters the domain.
- Set membership lives on the set (`WordSet.entryIds`, ordered) rather than on
  the entry, so the order is the study order and publishing a set does not need
  a query to find its contents.

[`src/lib/sanitize.ts`](src/lib/sanitize.ts) coerces pasted JSON and Firestore
documents rather than casting them: it is best-effort over the fields it knows
about, so enums, `freq` and `learnedOn` fall back to a default when the incoming
value is unusable, while `pitchAccent` accepts any number and tags are split but
not checked against `TAG_PATTERN`. URL
parameters are parsed separately in
`src/lib/filters.ts`. Writes are validated on their own — the form rejects a
missing headword or definition, bad tags and an impossible `learnedOn` before
anything reaches Firestore. Coercing on read is not a substitute for that, and
rules enforce account access only, never document shape.

## Language note

> The app UI is in Japanese and repository documentation is in English. Entry
> content is mostly Japanese, with Cantonese (Traditional Chinese) translations
> and remarks in `definitionSub` and the translation fields.

## License

Source code: [MIT](LICENSE).

The Japanese vocabulary entries are **not** covered by it. They are personal
study notes and they are reserved. They were used to populate Firestore during
the completed migration, and the current working tree no longer carries the
import artefacts. The scope note at the bottom of [`LICENSE`](LICENSE) is the
authoritative wording.
