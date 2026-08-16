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
| `accents.ts`    | Fills `pitchAccent` in `output.json`, in two halves with an assistant in between.                |
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
the account must have signed into the app at least once.

**The uploader checks that the owner carries the `allowed` custom claim and
refuses to run without it.** It used to _write_ `allowedUsers/{uid}`, back when
the rules read that collection; they gate on the claim now and nothing reads it,
so the write had stopped granting anything while still reporting that it had.
Uploading a notebook its owner is then denied access to is the easy mistake, and
the check is what stops it — before 67 documents are written rather than after.

What it cannot check is the other half: a claim reaches a client only in a
freshly minted ID token, so an account granted access while signed in still sees
nothing until it signs out and back in. Nothing server-side can observe that.

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

## Filling the pitch accents

`pitchAccent` was added to the schema long before it had a form, so all 67
entries carry `null`. `accents.ts` fills them **before** the production upload,
because editing 67 documents in Firestore afterwards is the same work with none
of the checking.

It runs in two halves, and the middle step is you:

```bash
yarn migrate:accents prompt              # writes migration/accents.prompt.txt
#   → paste that file into an assistant, save its reply as answers.json
yarn migrate:accents apply answers.json  # merges into output.json
```

The prompt lists every word with **its mora count already worked out**, using
the same `splitMora` the app draws with:

```
蔑む        さげすむ    4拍 (さ・げ・す・む)
鵜呑みにする うのみにする 6拍 (う・の・み・に・す・る)  ← 句なので null
```

Counting mora is the thing an assistant gets wrong — きょ is one beat, っ and ん
and ー are each their own — so it is not asked to. The expected reply is
`[{ "headword": "兆候", "pitchAccent": 0 }, …]`, matching headwords exactly.

`apply` checks every number against that word's own mora count before writing
it, and prints what it did:

```
書き込み: 3 件
  兆候 0（平板） / 蔑む 3（中高） / 安堵 1（頭高）
拍数に合わないため不採用: 2 件
  示唆（しさ, 2拍）← 9
  生半可（なまはんか, 5拍）← 2.5
```

**Nothing that fails the check is written.** Re-run it as often as you like:
each run reads `output.json`, applies what passes, and reports the rest, so a
second opinion on the refused words is just another `apply`.

### Expect roughly a third to stay `null`, and leave them

These 67 are not dictionary vocabulary. Four are phrases (`鵜呑みにする`,
`足をかける`, `後出しじゃんけん`, `定着率低い`) and **a phrase has no single
accent number at all** — it is several accent phrases, so the prompt marks them
and asks for `null`. Perhaps ten more are ad-hoc or technical compounds
(`切れ罠`, `読み下し版`, `危篤性`, `冪等性`, `ポーリング方式`) that no accent
dictionary contains, and half a dozen are slang that varies by speaker
(`メロい`, `ビジュ`, `グダる`, `バズ`).

A `null` there is the correct answer, not a gap to fill on a second pass. A
wrong accent is invisible — nobody can tell 2 from 3 by looking at the line —
so it gets memorised, which is worse than not knowing.

### Two things it deliberately does not do

- **It never reads `bak/`.** That is the pre-correction Markdown, it is not in
  the repo, and re-deriving anything from it would reintroduce the three wrong
  readings and lose the six hand-written sections. `output.json` is the input.
- **It does not touch `upload.mjs`.** That script spreads `...rest` over each
  entry, so `pitchAccent` has been shipping all along — as `null` until now.

`accents.prompt.txt` is generated and gitignored. This whole folder goes when
production has been loaded and verified.

## Production rollout

Production has never been written to and has no rules deployed. In order:

1. Run _Deploy (production)_. It deploys rules **then** hosting, which is the
   order that matters: a client briefly older than its rules fails closed, and
   the other way round fails open.

   **Hosting is what makes step 2 possible.** On a project that has never been
   deployed there is no app to sign into, so this cannot be shortened to
   `yarn rules:prod` — that deploys rules only, and leaves you at step 2 with
   nothing to open. It is the right command later, when hosting is already live
   and only the rules have changed.

2. Sign into the production app once, so the account exists and `--owner` can
   resolve to a uid.
3. `yarn allow you@example.com prod`, **then sign out and sign back in.** The
   rules gate on a custom claim, and a claim reaches a client only in a freshly
   minted ID token — an open session stays denied for up to an hour. Step 5
   refuses to run until the claim is set, but it cannot tell whether you have
   signed in again since.
4. Fill the accents — see above. Cheap now, 67 hand edits later.
5. `node migration/upload.mjs prod --owner you@example.com --confirm` — loads
   the 67 entries.
6. Verify the count is 67 and spot-check one entry with a 📌 context section.
7. **Then use the app** — add, edit and delete a word. Everything above runs
   through the Admin SDK, which bypasses rules entirely, so nothing before this
   proves the paths, `ownerUid` and the deployed rules agree.

Step 1 before step 2 is the whole point of the ordering; do not reverse it.
