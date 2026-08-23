# Releasing

A release is a `release/*` branch cut from `develop`, merged into `main`.
`main` is production. Nothing else reaches it.

The version number is not chosen. It is computed from the commit messages
between the last tag and the release branch, by `commit-and-tag-version`, which
also writes [CHANGELOG.md](../CHANGELOG.md). Configuration is
[`.versionrc.json`](../.versionrc.json); the reasoning is here, because JSON
cannot hold it.

## What decides the version

Every merge into `develop` is a squash merge, so **the pull request title is the
commit message that lands** — the branch's own commits are discarded. That title
is what the release reads.

| Title prefix                                     | Bump  | In CHANGELOG.md |
| ------------------------------------------------ | ----- | --------------- |
| `feat:`                                          | minor | Features        |
| `fix:`                                           | patch | Bug Fixes       |
| `perf:`                                          | patch | Performance     |
| `revert:`                                        | patch | Reverts         |
| `feat!:` / `fix!:` / `BREAKING CHANGE:`          | major | —               |
| `docs: style: chore: refactor: test: build: ci:` | none  | no              |

Highest wins across the range. **That table is enforced by the `types` array in
`.versionrc.json`, and it has to be spelled out there** — the defaults do not
match it. `commit-and-tag-version` passes the config-spec's own list rather than
the preset's, and in the config-spec list `perf` is hidden and `revert` is absent
entirely, so out of the box a `perf:` change neither bumps nor appears anywhere
in the changelog. Measured both ways: with the list written out, a `perf`-only
range produces a patch and a Performance section; without it, the same range
produces a patch and an empty release.

**A range with nothing but `chore`, `docs`, `test` and `ci` still bumps a
patch**, and writes a release section with nothing under it. There is no setting
that prevents this without breaking something else: `noBumpWhenEmptyChanges`
looks like the answer and is not, because it hard-codes "empty" as "no `feat`,
`fix` or breaking change" and ignores the `types` array — measured, a `perf`-only
range under that option reports `no commits found` and cuts no release at all,
which is worse than the pointless patch it was meant to avoid.

So the guard is step 1 below rather than a flag: run the dry run, read what it
produced, and if the release section is empty, do not cut one. That is the same
reading that catches a wrong prefix.

Because the number is derived, a mistyped prefix does not merely read badly — it
changes the version and nothing downstream can tell. That is what
[`.github/workflows/pr-title.yml`](../.github/workflows/pr-title.yml) is for, and
why its type list has to stay in step with `.versionrc.json`.

Checking the title is not quite sufficient on its own, because GitHub does not
always use it. Under `squash_merge_commit_title: COMMIT_OR_PR_TITLE`, which is
what this repository had until 2026-08-22, a pull request with exactly one commit
gets that commit's message offered instead — so a title accepted as `feat:` can
land as `chore:` and move the next version with nothing reporting it.

Two things now prevent that, and both should stay. The setting is `PR_TITLE`, so
the title is what lands. The workflow also sets `validateSingleCommit` and
`validateSingleCommitMatchesPrTitle`, which make the commit and the title agree
before the choice can matter — because the setting is invisible to anyone reading
the repository and can be changed back without review, while the workflow is a
file that says why it exists.

### Why this project left `0.x`

`commit-and-tag-version` forces the preset's `preMajor` mode on for any current
version below `1.0.0` — `lib/lifecycles/bump.js` does it unconditionally, and a
`preMajor: false` in `.versionrc.json` is overwritten rather than honoured. In
that mode every level shifts down one: `feat` becomes a patch, and a breaking
change becomes a minor. Measured on this repository at `0.1.0`, the nine
features between `v0.1.0` and `develop` produced `0.1.1`.

The version would then have stopped saying anything — `0.1.2`, `0.1.3`, on
through a rewrite. The app was already in production with real data and every
screen the design called for, so the first release under this tooling is
**`1.0.0`**, and from `1.0.0` the table above applies with no override.

That one release needed `--release-as major`, because the run that leaves `0.x`
is the one run the tool cannot compute. Every release after it is `yarn release`
with no arguments.

## Cutting a release

**1. Find out what the next version is.** From an up-to-date `develop`:

```sh
git switch develop && git pull
yarn release:dry
```

A dry run writes nothing. Read the version it proposes and the changelog it
would generate; this is the moment to notice a wrong prefix, while it still
costs a title edit rather than a tag.

**For the release that leaves `0.x`, and only that one, add `--release-as
major`** — to this command and to the one in step 2. Without it both compute
`0.1.1`, for the reason above, and you would be naming a branch `release/1.0.0`
around a `0.1.1`. After `1.0.0` is on `main`, drop the flag and never pass it
again.

**2. Cut the branch and run it for real.**

```sh
git switch -c release/1.0.0
yarn release --release-as major   # the flag is for this one release only
```

It bumps `package.json`, writes `CHANGELOG.md`, and commits both as
`chore(release): 1.0.0` — no `v`, because `.versionrc.json` sets `skip.tag`
and the commit message template reads the bare version, not a tag. It does
**not** tag — see step 6.

**3. Read the diff before you push it.** `package.json` and `CHANGELOG.md`, and
nothing else. The changelog is a public artefact of a public repository.

**4. Open the pull request into `main`,** titled `chore(release): 1.0.0`.

`main` requires `verify`, `emulator` and `e2e` — three checks against
`develop`'s one — plus every conversation resolved. This pull request is the
release decision: it shows the version and the whole changelog before anything
is irreversible.

**5. Merge it with a merge commit. Not a squash.**

This is the one place the repository's ordinary squash merge is wrong, and
getting it wrong is not cosmetic. A squash creates a _new_ commit on `main`, so
the commit carrying the version bump never exists there, `develop` and `main`
diverge permanently, and the ancestry check in `deploy-prod.yml` is asked about
a commit that is not on the branch. `v0.1.0` was merged correctly — `a121906`
is a merge commit — but by intent rather than by any setting, so it is on you
each time.

**6. Deploy, then tag.**

Run _Deploy (production)_:

- In GitHub, go to the repository's **Actions** tab.
- In the left sidebar, select **Deploy (production)**.
- Click **Run workflow**, then select `main` under "Use workflow from".

The workflow asks for the full 40-character SHA of the merge commit from step 5
as **"Commit SHA to deploy"**. Get it one of two ways:

- Terminal: `git switch main && git pull`, then `git rev-parse HEAD`.
- GitHub web UI: open the `main` branch's commit history and copy the full
  40-character SHA of the merge commit.

If a new account has to work after this release, do the claim steps in
[README → Operator runbook](../README.md#operator-runbook) **first**; the order
there is not a preference.

Once the deploy is green, tag **the SHA you gave the workflow** — not whatever
`main` points at by then:

```sh
SHA=<the same 40 characters you pasted into Deploy (production)>
git fetch origin main
git tag -a v1.0.0 "$SHA" -m 'v1.0.0'
git push origin v1.0.0
gh release create v1.0.0 --title v1.0.0 \
  --notes-file <(git show "$SHA:CHANGELOG.md" | awk '/^## /{n++} n==1')
```

The tag comes after the deploy, not with the bump, so that **a tag means
something shipped**. A tag written by `yarn release` would be a claim about a
deploy that had not happened and might still fail.

Naming the SHA is the other half of the same guarantee, and it is the half that
is easy to drop. `git switch main && git pull` tags whatever has landed since —
and a hotfix merged in the minutes between the deploy and the tag would put
`v1.0.0`, and the GitHub Release, on code that was never deployed. Reading the
changelog out of `$SHA` rather than the working tree keeps the release notes on
the same footing.

**7. Merge `main` back into `develop`.**

This pull request almost always has only one non-merge commit: the release
commit from step 2. `main` and `develop` have nothing else between them,
because only release branches reach `main`. `pr-title.yml`'s
`validateSingleCommit` and `validateSingleCommitMatchesPrTitle` (see "What
decides the version" above) therefore check the title against that one commit
too. A title that merely _describes_ the merge — `chore: merge 1.0.0 back into
develop` — fails it, because it is not that commit's message.
Title the pull request with that commit's message, verbatim:

```sh
gh pr create --base develop --head main --title 'chore(release): 1.0.0'
```

If you are not sure what the release commit's exact message was, read it rather
than retype it:

```sh
# $SHA is the merge commit from step 6; the second parent is the release branch tip.
git log -1 --format=%s "$SHA^2"
```

Not bookkeeping. The tag sits on a merge commit on `main`, and that commit is
not reachable from `develop` until `main` is merged back — so until it is,
`yarn release` on the _next_ release branch cannot find `v1.0.0`, recomputes
from further back, and rebuilds a changelog out of commits that already shipped.
`v0.1.0` reached `develop` exactly this way, as pull request #48.

**Merge it with a merge commit, as in step 5.** Squashing copies `main`'s
content onto a new commit that is not the tagged one, so the tag stays
unreachable from `develop` and none of the above is actually fixed.

Check it rather than trusting it:

```sh
git merge-base --is-ancestor v1.0.0 develop && echo ok
```

## Things that are still manual

Steps 6 and 7 are hand-run today. The tag and the GitHub Release belong in the
deploy workflow — it is the only thing that knows whether the deploy actually
succeeded — which needs `deploy-prod.yml` to trigger on a push to `main` rather
than on `workflow_dispatch`. That change is deliberately not in the same pull
request as this tooling, so that a problem with it cannot block a release from
being cut the way it always has been.
