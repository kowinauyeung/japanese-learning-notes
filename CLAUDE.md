# Working in this repository

Instructions for AI coding agents. Everything here is a rule, not a suggestion —
if one of them stops you doing something you believe is right, say so in your
reply rather than working around it silently.

Project overview, architecture and setup live in [README.md](README.md).

## Testing

The suite exists because two defects reached review that durable coverage would
have caught, and because Firestore security rules are the entire authorization
boundary of a client-only app. Rules that follow are shaped by what actually
went wrong here, not by general principle.

### Pick the cheapest layer that can see the defect

| Layer               | Directory           | Runs on                   | Use it when                                                                 |
| ------------------- | ------------------- | ------------------------- | --------------------------------------------------------------------------- |
| Unit                | `tests/unit`        | node, no dependencies     | The behaviour is a function of its inputs. **Default. Most tests go here.** |
| Component           | `tests/component`   | jsdom                     | The claim is about rendered DOM structure, text or roles.                   |
| Adapter integration | `tests/integration` | Firestore emulator        | The claim involves a query, an index, a cursor or a server timestamp.       |
| Rules               | `tests/rules`       | Firestore emulator        | The claim is "who may read or write what".                                  |
| End-to-end / visual | `tests/e2e`         | Chromium + `vite preview` | The claim spans routing, the URL and a provider — or is about layout.       |

Two consequences worth stating outright, because getting either wrong produces a
suite that looks thorough and proves nothing:

- **Pure logic never belongs in an end-to-end test.** Filtering, sorting, date
  maths and coercion are exhaustively covered in `tests/unit`. Adding a
  Playwright test for another filter combination costs seconds per run and
  proves less than the unit test already does.
- **The Firestore adapter never belongs in a unit test.** `tests/unit/cursor.test.ts`
  stayed green through the entire life of the pagination bug, because the defect
  was in _which value the adapter passed_ to the cursor, not in the cursor.
  Anything touching a query goes in `tests/integration`, against the emulator.

State the layer you chose and why in the pull request description.

### Never mock code we own

You may substitute an external service. You may not substitute `src/lib`,
`src/domain` or `src/components`.

The in-memory adapters in `src/lib/backend.e2e.ts` are not an exception: they
implement a _port_ that `src/domain/ports.ts` already defines, at a seam the
architecture already had. Standing in for a port is design; replacing a module
with a stub so a test passes is hiding the thing under test.

### Assert on behaviour, not on how it happens

Assert on return values, rendered output, and stored state. Do not assert that
an internal helper was called, or spy on a function in the same module.

`tests/component/Ruby.test.tsx` asserts that `<ruby>` carries no class attribute.
That reads like an implementation detail and is not one: a display override there
drops the element out of its ruby formatting context, so the annotation renders
beside the word instead of above it. If you write an assertion that looks
structural, the comment above it must say what breaks when it fails.

### Name the test after the defect

```
✅ it('rejects 2026-02-31, which Date silently rolls forward instead of refusing')
✅ it('refuses the protocol-relative //evil.com')
❌ it('should work')
❌ it('tests isValidIsoDate')
```

A reader who has never seen the code should be able to tell, from the name
alone, what breaks in production when it goes red.

### Prove the test fails before you claim it passes

For any test written against a bug fix or an existing guard: revert the fix,
run the test, confirm it fails, and confirm **only the tests you expect** fail.
Then restore and re-run.

A test that has never been red is a test whose failure mode is unknown. This is
not optional and it is not a formality — it caught a real problem here: a
pagination test that hung to its timeout instead of failing, which reads as flake
rather than as the regression it was.

**Reproduce the defect, not something next to it.** The `<ruby>` bug was a class
_moved_ onto the element. A check that _added_ it there while leaving the
wrapper untouched renders differently, passes a screenshot the real defect
fails, and put a false claim into a pull request that a reviewer then had to
disprove by measurement. Where the original shape is in version control or
described in a comment, reproduce that shape exactly — and when a test you
expected to go red stays green, treat it as evidence about your reproduction
before you treat it as a fact about the test.

Say in the pull request that you did it, and name what went red.

### Screenshot baselines

The four PNGs under `tests/e2e/__screenshots__` are the expected result, not
generated output.

- **You may create a new baseline**, but only if you `Read` the generated PNG
  and describe in your reply what it shows. A baseline you have not looked at is
  a rubber stamp with a file extension.
- **You may never update an existing baseline to turn a failing test green.**
  A screenshot diff is a bug report. Investigate it, fix the cause, and if the
  new rendering really is correct, ask the user to regenerate.
- Regeneration is `yarn test:visual:update`, which runs in the same container
  image CI uses. Never run `--update-snapshots` outside it: a macOS-authored
  baseline fails on every CI run.
- Prefer `locator.toHaveScreenshot()` over a full-page shot. Do not add a new
  full-page baseline without asking.

The same applies to `toMatchSnapshot()`. Use it only for small, human-readable
objects, and pair it with at least one ordinary assertion, so a regenerated
snapshot cannot silently become the only thing the test checks.

### Where test data lives

Fixtures go in `tests/fixtures` and `tests/e2e/fixtures.ts`. Production modules
never import from `tests/`. Tests may import production constants and enums —
duplicating them is how a test keeps passing after the schema moves.

`makeEntry()` is built by hand rather than by running `sanitizeEntry` over a
blob, because the sanitiser is itself under test.

### Anything that reads the clock takes it as an argument

`summarise(entries, now)`, not `summarise(entries)`. A test that passes only on
the day it was written is worse than no test. The Playwright specs freeze time
in `tests/e2e/fixtures.ts`; a dashboard baseline would otherwise change nightly.

### Do not generate tests in bulk

No boilerplate test per component. A new test corresponds to a real behaviour,
a backlog item, or a defect. Coverage is reported (`yarn coverage`) and
deliberately not enforced: a threshold rewards writing assertions that execute
lines over assertions that would fail on a defect.

### Tests obey the same import fences as `src`

An end-to-end or component test may not import `@/infra/*`. If a test needs the
Firestore adapter, it belongs in `tests/integration`.

### Deliberately not tested

Do not add coverage for these without asking first:

- Field-by-field wiring in `EntryForm.tsx` — one end-to-end save covers it.
- Placeholder routes.
- Tailwind class combinations and colour choices, unless layout carries meaning
  (furigana, the heatmap), which is what the four screenshots are for.
- Transitions and animation timing.
- The Firebase Hosting deploy pipeline.

## Commands

| Command                   | What it runs                                           |
| ------------------------- | ------------------------------------------------------ |
| `yarn test:unit`          | Unit + component. No JDK, no browser. Run this first.  |
| `yarn test:emulator`      | Rules + adapter. Needs JDK 21.                         |
| `yarn test`               | Both of the above.                                     |
| `yarn test:e2e`           | Playwright. Builds and serves automatically.           |
| `yarn test:visual:update` | Regenerates screenshot baselines in Docker. Ask first. |
| `yarn typecheck`          | Two passes: the app, then `tsconfig.test.json`.        |
| `yarn coverage`           | Reported, never enforced.                              |

On macOS the Firestore emulator needs JDK 21 ahead of any newer JDK on `PATH`:

```sh
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"
```
