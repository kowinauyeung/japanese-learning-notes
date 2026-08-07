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

### Planned

Flashcards, dictation, word sets and practice history are placeholder routes.

## Stack

| Layer       | Choice                                         |
| ----------- | ---------------------------------------------- |
| Build       | Vite 7                                         |
| UI          | React 19 + TypeScript (strict), React Router 7 |
| Styling     | Tailwind CSS 4                                 |
| Data & auth | Firebase — Firestore + Google sign-in          |
| Hosting     | Firebase Hosting                               |

Pure client-side app: the Firestore web SDK talks to the database directly, and
security rules — not a server — are what protect the data. The whole `entries`
collection is loaded into memory once, and search, filtering and sorting all run
over that array. There is no pagination; the design assumes a personal notebook,
not a corpus.

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
3. Replace the hard-coded owner email in `firestore.rules` with your own.
4. Point the tooling at your project: change the `dev` alias in `.firebaserc`,
   or pass `--project <your-project-id>` instead of using the `rules:dev`
   script, which is wired to `goitei-dev`.
5. `yarn firebase login`, then deploy the rules with `yarn rules:dev` (once the
   alias points at your project) or
   `yarn firebase deploy --only firestore:rules --project <your-project-id>`.

`firebase-tools` is a local devDependency, so the CLI is reached through
`yarn firebase …` unless you have installed it globally.

Steps 3 and 4 only change local configuration; nothing is enforced until step 5
deploys the rules successfully. After that deploy, sign-in works and every read
and write is scoped to your account.

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
| `yarn typecheck`                       | `tsc -b --noEmit`                                     |
| `yarn rules:dev` / `yarn rules:prod`   | Deploy `firestore.rules`                              |
| `yarn auth:login` / `yarn auth:revoke` | Repo-local Google ADC, used by the migration upload   |

`yarn auth:login` writes to `.gcloud/` via `CLOUDSDK_CONFIG`, deliberately apart
from the machine-wide `~/.config/gcloud`. There is no long-lived service-account
key in this project, and there should not be one.

`migrate:parse` and `migrate:upload` are one-shot migration scripts — see
[`migration/README.md`](migration/README.md) before running either.

## Environments

`.firebaserc` maps `default` and `dev` to `goitei-dev`, and `prod` to `goitei`,
so a deploy with no `--project` targets development. Branches follow the same
split — `develop` for dev, `main` for production. Both are protected: changes
land through a pull request with a green CI run, and neither accepts a force
push.

Pushing to `develop` deploys hosting and Firestore rules to `goitei-dev`, and
every pull request gets its own Hosting preview channel that expires after seven
days. Preview channels are hosting-only: rules are project-wide, so deploying
them from a pull request would change the rules every other preview runs under.
A preview reads the real `goitei-dev` data, not a copy.

**Production is not automated.** Nothing in `.github/workflows/` can reach
`goitei`; deploy it by hand with the commands below.

Which project a build talks to comes from the env file Vite picks, not from the
`--project` flag, so the two must be set together:

```bash
# dev
yarn vite build --mode development
yarn firebase deploy --only hosting,firestore:rules --project dev

# production
yarn build
yarn firebase deploy --only hosting,firestore:rules --project prod
```

`firestore.rules` allows read and write on `entries`, `entryProgress`,
`practiceSessions` and `wordSets` for one hard-coded verified email; every other
path is denied. For the first production import, follow the rules-first order in
[`migration/README.md`](migration/README.md).

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
  there. Adding `&& assertion.ref == 'refs/heads/develop'` looks like free
  hardening and is not: a pull request's token carries
  `ref = refs/pull/<n>/merge`, so it would block every preview deploy. See the
  trust boundary below for what actually contains the risk.
- A pool cannot span projects. Automating production means a second pool,
  provider and service account inside `goitei`, and a second set of secrets —
  the procedure is reusable, nothing else is. Until then, deploy production by
  hand.

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
every preview deploy, since a pull request's token carries
`ref = refs/pull/<n>/merge`. That is not defence in depth, it is the feature
switched off.

The tightening that costs nothing is two service accounts instead of one, bound
through the pool's `attribute.event`: `push` gets hosting **and** rules admin,
`pull_request` gets hosting admin only. A preview then cannot touch rules even
if something goes wrong upstream of it. Worth doing if this workflow ever grows
past one environment.

## Data model

Defined in [`src/types/entry.ts`](src/types/entry.ts). Points worth knowing:

- A new entry requires `headword` and `definition`. `definition` is the only
  required explanatory field and is not tied to a language; the migrated entries
  keep their Cantonese gloss in `definitionSub`.
- `pos` is an array — plenty of entries are compound (名詞／動詞).
- Tags allow letters, digits and underscore only (`/^[\p{L}\p{N}_]{1,32}$/u`),
  so kanji are fine but spaces and punctuation are not.
- `learnedOn` is an editable `YYYY-MM-DD` date. It drives the week/month/year
  counts, the heatmap and the recent list; the JLPT and part-of-speech
  breakdowns read their own fields. `createdAt` is written once, `updatedAt` on
  every save.

[`src/lib/sanitize.ts`](src/lib/sanitize.ts) coerces pasted JSON and Firestore
documents rather than casting them: it is best-effort over the fields it knows
about, so enums, `freq` and `learnedOn` fall back to a default when the incoming
value is unusable, while `pitchAccent` accepts any number, tags are split but not
checked against `TAG_PATTERN`, and `wordSets` takes arbitrary strings. URL
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
