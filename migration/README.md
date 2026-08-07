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
| `upload.mjs`    | Writes `output.json` to Firestore. The only script that still needs to run.                      |
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
node migration/upload.mjs dev              # goitei-dev
node migration/upload.mjs prod --confirm   # goitei — --confirm is mandatory
```

`upload.mjs` uses `set()` without merge, so a document is fully replaced and
stale fields disappear. It is idempotent: re-running converges on `output.json`.

Documents **not** in `output.json` are left untouched — `dev` currently holds
four entries created through the app that the uploader will never overwrite.

## Production rollout

Production has never been written to and has no rules deployed. In order:

1. `yarn rules:prod` — deploy `firestore.rules` first, so the collection is
   never briefly writable by anyone but the owner.
2. `node migration/upload.mjs prod --confirm` — loads the 67 entries.
3. Verify the count is 67 and spot-check one entry with a 📌 context section.

Step 1 before step 2 is the whole point of the ordering; do not reverse it.
