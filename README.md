# 語彙庭 Goitei — Japanese Vocabulary Notebook

A personal web app for recording and reviewing Japanese vocabulary picked up in
daily life and at work, with Cantonese translations and notes.

This repository began as 67 hand-written Markdown notes. Once they were imported
into Firestore the tracked Markdown was removed, so Firestore now holds the live
data. [`migration/README.md`](migration/README.md) documents the committed import
artefacts and how to replay them.

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
   your account carries the `allowed` custom claim. `yarn allow <your-email>`
   sets it, and the account must have signed in before that, because the claim
   goes on the uid Google issued and there is nothing to set it on until then.
   **`yarn allow` is the one step here that cannot be pointed at your project.**
   `admin/allow-user.ts` names `goitei-dev` and `goitei` directly, never reads
   `.firebaserc`, and rejects any argument other than `prod` and `--revoke` — so
   on a fresh project it will tell you the account has never signed in. Set the
   claim through the Admin SDK yourself; that script is the worked example.
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
| `yarn rules:dev` / `yarn rules:prod`   | Deploy `firestore.rules`                              |
| `yarn auth:login` / `yarn auth:revoke` | Repo-local Google ADC, used by the migration upload   |

`yarn auth:login` writes to `.gcloud/` via `CLOUDSDK_CONFIG`, deliberately apart
from the machine-wide `~/.config/gcloud`. There is no long-lived service-account
key in this project, and there should not be one.

`migrate:parse` and `migrate:upload` are one-shot migration scripts — see
[`migration/README.md`](migration/README.md) before running either.

## Tests

Five layers, split by what each one needs to run rather than by what it covers.
[`CLAUDE.md`](CLAUDE.md) has the rules for choosing between them and for writing
new ones.

| Command                   | Covers                                                                                                                     | Needs    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| `yarn test:unit`          | `tests/unit` — coercion, filters, dates, furigana, import, redirects; `tests/component` — rendered DOM                     | nothing  |
| `yarn test:emulator`      | `tests/rules` — who may read and write what; `tests/integration` — the Firestore adapter's queries, cursors and timestamps | JDK 21   |
| `yarn test:e2e`           | `tests/e2e` — sign-in, browse, create, edit, delete; four screenshot baselines                                             | Chromium |
| `yarn test:visual:update` | Regenerates those baselines                                                                                                | Docker   |
| `yarn coverage`           | Reported, never enforced                                                                                                   | nothing  |

Three things worth knowing before adding to it:

- **The end-to-end build does not touch Firebase.** `vite build --mode e2e`
  aliases `src/lib/backend.ts` to an in-memory twin, so Playwright is
  deterministic and needs no emulator or Google popup. Firestore is covered
  where it can be asserted precisely instead — `tests/integration` for the
  adapter, `tests/rules` for the boundary.
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
— every pull request except one into `main` or a `release/*` branch, which get
CI and no preview. The deploy job checks out the pull request's base, so it
needs a base that carries the toolchain, and a release into `main` is the one
case that does not. Preview channels are hosting-only: rules are project-wide, so deploying
them from a pull request would change the rules every other preview runs under.
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

For the first production import, follow the rules-first order in
[`migration/README.md`](migration/README.md).

### Operator runbook

Everything below assumes `GOOGLE_APPLICATION_CREDENTIALS`, or `gcloud auth
application-default login` against the right project.

**Granting access.** `yarn allow you@example.com prod`. The account must have
signed in once first — the claim is set on the uid Google issued, so there is
nothing to set it on before that. Anything other than `prod` or `--revoke` is
rejected rather than ignored.

**Revoking it.** `yarn allow you@example.com prod --revoke`. **This lands within
the hour, not on the keystroke.** The claim lives inside the ID token the client
already holds and Firestore rules have no revocation check, so it keeps working
until that token expires. Revoking the refresh tokens ends the session at the
next refresh but does not shorten that window. When responding to abuse, delete
the data — that part takes effect now.

**Releasing.** Three steps, in this order:

1. `yarn allow <email> prod` for every account that must keep working.
2. Ask each of them to sign out and sign back in. A claim reaches the client
   only in a freshly minted ID token; an open session picks it up at its next
   refresh, which is up to an hour away.
3. Run _Deploy (production)_.

The order is not a preference. The workflow deploys rules before hosting on
purpose — a client briefly older than its rules fails closed, the other way
round fails open — and the rules being deployed require a claim that no token
issued before step 1 carries. Reversing steps 1 and 3 locks out everyone who was
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

#### Trust boundary

The deploy workflow is split into two jobs, and the split is the security
boundary rather than a build-time optimisation:

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
the two jobs buy.

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
study notes, committed as `migration/output.json` and `migration/review.json`
so the Firestore import stays inspectable — see
[`migration/README.md`](migration/README.md) — and they are reserved. The scope
note at the bottom of [`LICENSE`](LICENSE) is the authoritative wording.
