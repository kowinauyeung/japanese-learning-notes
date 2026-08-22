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

Highest wins across the range. A release whose commits are all `chore` and
`test` computes no version at all, and `yarn release` says so rather than
inventing a patch bump.

Because the number is derived, a mistyped prefix does not merely read badly — it
changes the version and nothing downstream can tell. That is what
[`.github/workflows/pr-title.yml`](../.github/workflows/pr-title.yml) is for, and
why its type list has to stay in step with `.versionrc.json`.

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

**2. Cut the branch and run it for real.**

```sh
git switch -c release/1.0.0
yarn release
```

It bumps `package.json`, writes `CHANGELOG.md` and commits both as
`chore(release): v1.0.0`. It does **not** tag — see step 6.

**3. Read the diff before you push it.** `package.json` and `CHANGELOG.md`, and
nothing else. The changelog is a public artefact of a public repository.

**4. Open the pull request into `main`,** titled `chore(release): v1.0.0`.

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

Run _Deploy (production)_ and give it the full 40-character SHA of the merge
commit. If a new account has to work after this release, do the claim steps in
[README → Operator runbook](../README.md#operator-runbook) **first**; the order
there is not a preference.

Once the deploy is green:

```sh
git switch main && git pull
git tag -a v1.0.0 -m 'v1.0.0' && git push origin v1.0.0
gh release create v1.0.0 --title v1.0.0 --notes-file <(awk '/^## /{n++} n==1' CHANGELOG.md)
```

The tag comes after the deploy, not with the bump, so that **a tag means
something shipped**. A tag written by `yarn release` would be a claim about a
deploy that had not happened and might still fail.

**7. Merge `main` back into `develop`.**

```sh
gh pr create --base develop --head main --title 'chore: merge 1.0.0 back into develop'
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
