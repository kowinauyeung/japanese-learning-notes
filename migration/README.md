# Migration

One-shot import of the 67 hand-written Markdown vocabulary notes into Firestore.
It has already run against `goitei-dev`. It has **not** run against production.

## Why `output.json` is committed

The Markdown notes were removed once the import was verified, so they are no
longer in the working tree. Recovering them from history is not equivalent
either: three headword readings were corrected and six 文脈別の意味 sections were
written by hand _during_ the migration, after the last commit that still
contained the Markdown. Re-parsing `4fb4ab8~1` would faithfully reproduce the
three errors.

`output.json` is therefore the artefact of record — the exact 67 documents that
were loaded — and `review.json` is its verification report. `[]` means every note
parsed with no outstanding item. Both are committed so the import can be
inspected in review and replayed to production from a clean checkout.

`parse.mjs` and `normalize.mjs` are kept for provenance: they document how each
Markdown field became an `Entry` field, and they are the place to look when a
value in Firestore is surprising. They are not re-runnable without the notes.

## Files

| File            | Role                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `parse.mjs`     | Markdown → `Entry` JSON. Needs `bak/` (not in the repo); writes `output.json` and `review.json`. |
| `normalize.mjs` | Field-level coercion — 品詞, JLPT, 語種, 文体, 丁寧さ, 頻度, and inline-Markdown stripping.      |
| `upload.mjs`    | Writes `output.json` to `users/{uid}/entries`. The only script that still needs to run.          |
| `output.json`   | The 67 verified entries. **The artefact of record.**                                             |
| `review.json`   | Parser warnings needing human judgement. `[]` = clean.                                           |

The scripts are MIT like the rest of the source. The entries inside
`output.json` and `review.json` are not: they are personal study notes,
committed for provenance rather than reuse. See the scope note at the bottom of
[`LICENSE`](../LICENSE).

## Running the upload

Credentials resolve in this order, and the machine-wide ADC is never used
unless asked for explicitly — this repo's Google identity is deliberately kept
apart from the one in `~/.config/gcloud`:

1. `.gcloud/application_default_credentials.json` (repo-local; `yarn auth:login`)
2. `$GOOGLE_APPLICATION_CREDENTIALS`
3. `migration/service-account-<env>.json`
4. machine-wide ADC — only with `--use-global-adc`

```bash
node migration/upload.mjs --owner you@example.com                     # goitei-dev
node migration/upload.mjs prod --owner you@example.com --confirm      # goitei
```

`--owner` is mandatory. Entries live at `users/{uid}/entries/{autoId}`, and the
uid is resolved from that address through the Admin SDK rather than guessed, so
the account must have signed into the app at least once. The uploader also
ensures `allowedUsers/{uid}` exists — the security rules gate every path on it
and no client can write that collection, so uploading a notebook its owner would
then be denied access to is the easy mistake to make.

`upload.mjs` uses `set()` without merge, so a document is fully replaced and
stale fields disappear. It is still idempotent, but by a different mechanism:
document ids used to be the note filenames, so `set()` on a known id converged.
Ids are auto-generated now — slugs are unique per user at best and would collide
the moment anything is shared — so the old slug rides along as `migrationKey`,
and the script reads the collection once to map key → document before choosing
update or create. Without that, a second run would create 67 duplicates.

Documents **not** in `output.json` are left untouched in the new collection.

`--wipe-legacy` deletes the pre-ownership top-level `entries` collection, which
no rule matches any more and which therefore only costs storage. Two things
about it are deliberate:

- **It runs last**, after the upload has finished and the new document count has
  been verified against `output.json`, and it refuses to run if the count falls
  short. Wiping first would mean a write that failed part-way through left
  neither copy intact.
- **It is genuinely destructive.** It removes the four entries created through
  the app (`チョコレート`, `潜り込む`, `バレる`, `ことわざ`) as well as the migrated
  ones, because they are not in `output.json` and cannot be restored from it.
  On `dev` that is intended — the data is disposable test material and the
  collection is being rebuilt under `users/{uid}` from scratch. Anywhere that
  distinction matters, export before passing the flag.

## Production rollout

Production has never been written to and has no rules deployed. In order:

1. `yarn rules:prod` — deploy `firestore.rules` first, so the collection is
   never briefly writable by anyone but the owner.
2. Sign into the production app once, so the account exists and `--owner` can
   resolve to a uid.
3. `node migration/upload.mjs prod --owner you@example.com --confirm` — loads
   the 67 entries and adds the `allowedUsers` record.
4. Verify the count is 67 and spot-check one entry with a 📌 context section.

Step 1 before step 2 is the whole point of the ordering; do not reverse it.
