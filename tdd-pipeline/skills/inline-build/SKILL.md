---
name: inline-build
description: >-
  Inline TDD pipeline — same flow as /build → /implement but runs ENTIRELY in the
  main thread with NO subagent spawns. Plans a feature inline, waits for approval,
  writes tasks/plans/<TICKET>_plan.md, then runs the full pipeline itself
  (test-writer → verify-red → implementer → test-runner retry loop →
  code-review) as sequential main-thread steps, stopping at the ship gate. At the review step it
  LAUNCHES the code-review-coordinator agent directly (author should not review
  own code — no ask; inline review is a fallback only). Writes a
  tasks/receipts/<TICKET>.json verification receipt that /ship gates on. STOPS to
  wait for the /ship command. Cheaper on spawn overhead, keeps one context. Use on
  '/inline-build <ticket|feature>', "build inline", "run the pipeline inline",
  "no agents build". Clone of the agent pipeline — does NOT touch build.md,
  implement.md, or build-coordinator.
---

# inline-build

The agent pipeline (`/build` → `/implement` → build-coordinator → 4 subagents) reimplemented
**inline**. Every stage that used to be a `Task`-spawned subagent is now a set of steps YOU (the
main thread) perform directly. No `Task` calls anywhere in this skill. One context, one token pool,
serial execution.

This is a **clone**. It reads no other skill/command and edits none. The originals stay untouched.

## When it runs

- `/inline-build <ticket|feature>` — full flow: plan → approve → write plan file → run pipeline
  inline → stop at ship gate.
- The pipeline half alone (skip planning) when the user points it at an existing
  `tasks/plans/<TICKET>_plan.md` and says "build inline" / "run this plan inline".

## The hard stops (same gates as the agent version)

1. **Approval gate** — no plan file is written until the user approves.
2. **Harness gate** — no test framework in the repo → STOP before writing anything (B0-PRE).
3. **Verify-red gate** — new tests must FAIL before implementation, or STOP.
4. **Test gate** — max 5 fix attempts; still failing → STOP.
5. **Review gate** — B4 launches the code-review-coordinator agent directly (author ≠ reviewer, no ask; inline is fallback only); any 🔴 Critical → STOP.
6. **Ship gate** — after code review, STOP and wait for `/ship`. Never commit/push/deploy here.

## The receipt

You record what you actually observed to `tasks/receipts/<TICKET>.json` as you go. `/ship` reads it
and refuses to open a PR when it is missing, stale, or red — so a pipeline run that writes no
receipt cannot be shipped.

```json
{
  "ticket": "PROJ-12",
  "plan": "tasks/plans/PROJ-12_plan.md",
  "sha": "<git rev-parse HEAD at the LAST stage written>",
  "red":    { "cmd": "pytest tests/test_proj12.py -q", "exit": 1, "at": "<UTC ISO-8601>" },
  "green":  { "cmd": "pytest -q", "exit": 0, "attempts": 2, "at": "<UTC ISO-8601>" },
  "review": { "critical": 0, "warnings": 2, "unverified": 0, "at": "<UTC ISO-8601>",
              "warning_list": ["scanner.py:412 unbounded retry loop"] },
  "gating": { "required": [...], "seeded": [...], "readback": "ok", "at": "<UTC ISO-8601>" },
  "stage":  "complete"
}
```

- `sha` — staleness detection: HEAD moving after the receipt means code changed after the last
  verified run.
- `exit` — the real process exit code. `red.exit` must be non-zero; `green.exit` must be 0.
- `review.unverified` — Criticals the verify pass reached no verdict on. Still hard-stop: "nobody
  checked" is not evidence of safety. Only an ACTIVELY REFUTED critical becomes a warning.
- `review.warning_list` — one short `file:line what` string per warning, so `/ship` prints them
  instead of a bare count.
- `gating` — omit entirely when the project has no `Gating: active` line or the ticket needs no
  gate. Present ⇒ `seeded` covers every `required` key and `readback` is `"ok"`.
- `stage` — `red` | `green` | `reviewed` | `complete`. Anything short of `complete` means the
  pipeline stopped early.

`/ship` verdicts: STOP on a missing file, `stage != "complete"`, a stale `sha`, `green.exit != 0`,
`red.exit == 0` (tests never failed, so they prove nothing), any `review.critical` or
`review.unverified`, or a `gating` block whose `readback != "ok"` / misses a `required` key.
`review.warnings > 0` → ask (ship anyway / fix first). Otherwise proceed.

`<TICKET>` is the same key used for the plan file (`tasks/plans/<TICKET>_plan.md`). Rules:
- `mkdir -p tasks/receipts` before the first write.
- Record the REAL exit code of the command you ran (`echo $?` right after it), never your reading of
  the output. A suite that prints "2 failed" and exits 1 is `"exit": 1`.
- Re-stamp `sha` (`git rev-parse HEAD`) and `stage` on every update.
- Timestamps: `date -u +%Y-%m-%dT%H:%M:%SZ`.
- Never write a stage's entry before that stage ran, and never write `"stage": "complete"` on a run
  that stopped early. A receipt describing a run that did not happen is worse than no receipt,
  because `/ship` trusts it. If you want past the gate, run the pipeline — do not edit the file.

---

## PHASE A — PLAN (inline, main thread)

Identical intent to `/build`, run directly in chat.

### A0. Triage-file check (bug path) — FIRST
- Derive ticket key from the request (e.g. `PROJ-123`).
- If a key is present, check for `tasks/<TICKET>-triage.md` (written by `/bug-triage`). If it exists:
  - Read it. Trust its **Verdict**, **Root cause (confirmed on disk)**, **Affected files**,
    **Excluded as adjacent**, **Suggested fix-plan seed**.
  - Verdict `not-reproducible` / `invalid` / `pre-existing` → STOP, surface the recommendation
    (close it / not our change). Nothing to build.
  - `real-bug` → write a LEAN fix-plan: smallest correct change at the shared point (not
    per-caller), the one seed test, the toggle gate if named. Skip broad exploration (A1).
- No triage file → normal feature path, continue A1.

### A1. Explore (read-only)
- Read the codebase relevant to the request. You MAY spawn read-only `Explore` subagents in
  parallel for breadth ONLY — they return text, write nothing. (This is the one allowed spawn:
  read-only research, not pipeline work.) Everything downstream is inline.
- If a `graphify-out/` exists, prefer graph navigation per the project CLAUDE.md before grep.

### A1.5. Gating check (only when the project is live)
Read the project CLAUDE.md for a `Gating: active` line. Absent or `off` → skip this step and every
gating step below; a pre-v1 project has no users to protect. Present → decide which side this ticket
needs: backend feeding a mobile surface → **toggle +
catalog**; backend-only → **toggle**; mobile reads Firestore directly → **catalog only**;
refactor/tooling → **neither**. Put the exact keys, the screen the catalog check wraps, and a
gate-off test case per side into the plan. Fold a genuinely ambiguous call into A3's question.

The two sides of the kill-switch, either one sufficient to starve a feature: the **backend toggle**
`feature_toggles/config.<name>` (off → the backend stops sending the data) and the **mobile catalog**
— ONE doc, `catalog/active`, a field per feature (off → the app stops rendering the surface). Both
**fail closed: absent means OFF**; a feature renders only on an affirmative `true`, and killing one
writes `false` rather than deleting the key. Name keys `feat_<name>` (long-lived) or
`fix_<TICKET>_<slug>` (short-lived rollback lever), identical on both sides. The app reads the
catalog through ONE shared fail-closed client, never ad-hoc per-screen reads. Seed the keys at
`false` and read them back AFTER verify-red and BEFORE implementation, so gated code is written
against a toggle that provably exists; the gate-off path is a REQUIRED test case per side.

### A2. Present the plan INLINE
Show the full plan in chat:

```
# Feature: [name]
## Summary
[2-3 sentences]
## Approach
[architecture decision — why this over alternatives]
## Design Reference
[UI tickets: the mockup path to build to, e.g. `design/exports/03-editor.png` (+ light
variant) — the visual contract, wins over prose on layout. Resolve from the ticket's
`Mock:` line, the repo's `design/exports/`, or CLAUDE.md's design-pack line.
Non-UI: "n/a". UI ticket with no mock found: "NONE FOUND — UI from prose only" + flag it.]
## Files to Create
- `path/to/file` — [purpose]
## Files to Modify
- `path/to/existing` — [what changes and why]
## Test Cases to Write
- [Test]: [scenarios]
## Gating  (omit entirely when the project has no `Gating: active` line)
- Name: `feat_<name>` (long-lived) · `fix_<TICKET>_<slug>` (retired ~2wk after stable). Same
  name on both sides.
- Toggle: `feature_toggles/config.<name>` — off ⇒ [what the backend stops sending]
- Catalog: `catalog/active` field `<name>` — off ⇒ [which screen/composable stops rendering]
- Gate-off tests: [toggle-off case] · [catalog-off case] · [absent key ⇒ OFF]
## Risks / Assumptions
- [anything that could go wrong or needs confirmation]
```

### A3. Approval via AskUserQuestion — write NOTHING yet
Call `AskUserQuestion` (clickable, no typed approval) with:
- **Approve — run pipeline inline** (Recommended): write plan file, then run PHASE B inline.
- **Approve — plan file only**: write `tasks/plans/<TICKET>_plan.md`, do NOT run pipeline.
- **Revise**: user says what to change (or "Other"). Revise inline, re-present, ask again.
- **Cancel**: no file, stop.

Fold any open plan questions (toggle default, scope) into the SAME call (max 4 total).

### A4. On approval ONLY
- Derive `<TICKET>`: a ticket id like `PROJ-123` if present; else a short kebab-case slug.
- Ensure `tasks/plans/` exists (create if missing).
- Write the approved plan to `tasks/plans/<TICKET>_plan.md`. Permanent per-feature record.

If "plan file only" → STOP here. Tell the user to run `/inline-build <plan-path>` (or `/implement`)
later.

---

## PHASE B — PIPELINE (inline, main thread, NO Task spawns)

Precondition: an approved `tasks/plans/<TICKET>_plan.md`. If a path was given, use it; else default
to the most recently modified `tasks/plans/*_plan.md`. If none exists → STOP: "Run the plan phase
first and approve a plan." State which plan file you resolved.

### B0-PRE. Harness pre-flight — BEFORE anything else in PHASE B
Run the B3 Step 0 ladder NOW to detect the project's test command. Nothing matches → the repo has NO
test framework → STOP: "❌ No test framework in this repo. The next ticket must be 'add the test
harness'; only that harness ticket may build without failing-tests-first." Never silently skip TDD
because tests are inconvenient.

This check belongs HERE, not at B3: run it late and B1's tests and B2's implementation are already
written before anyone notices there is nothing to run them with — which is how tickets have shipped
without TDD before. State the command you detected; B1.5 and B3 reuse it.

### B0. Jira → In Progress (if a ticket is in scope)
Derive the Jira key from the plan filename.
- Resolve the Jira MCP dialect FIRST — see `references/jira-mcp.md`. It returns the tool
  names for this machine and whether `cloudId` is a parameter. None resolved → log the skip
  line from that file and proceed to B1.
- List transitions with the resolved *list transitions* tool; find the one whose `to.name`
  is exactly `"In Progress"`. None → log
  "<KEY>: no 'In Progress' transition — skipping" and proceed.
- Apply it with the resolved *transition* tool, passing that id.
- 400 "transition not available/valid from current status" → already in/past In Progress, log the
  no-op and proceed. Any other error → log one-line warning, proceed. Pipeline never depends on
  Jira being up.
- No key derivable → skip silently.
- Log: "📋 Moved <KEY> → In Progress" or "📋 <KEY> already past In Progress".

### B1. Write failing tests  (inline test-writer)
Write tests BEFORE implementation. Tests compile but FAIL (red state). No implementation code.
1. Read the plan's Test Cases list.
2. Read existing test files for patterns (naming, mocking lib, structure). MIRROR the existing
   suite — never introduce a new test framework.
3. Write each test file listed in the plan. Assert real behavior — no empty tests, no
   `assertTrue(true)`.
4. Plan has a **Gating** section → its gate-off cases are REQUIRED tests: toggle off ⇒ the
   documented 404 / omitted field; catalog off ⇒ surface not rendered; and the absent-key case ⇒
   behaves as OFF (fail closed). An untested off-path is discovered during the incident it was
   built for.

Stack rules — apply ONLY the section matching the detected project:
- **Android/Kotlin**: JUnit4 + MockK; kotlinx-coroutines-test for suspend; `MainDispatcherRule`;
  Turbine for StateFlow; never `Thread.sleep()` — use `advanceUntilIdle()`.
- **Python**: existing runner (default pytest); plain functions + fixtures unless suite uses
  classes; `unittest.mock`/`monkeypatch` at the real import site; `pytest-asyncio` for async;
  never `time.sleep()`; freeze/inject time & randomness.
- **JS/TS**: existing runner (jest/vitest/mocha) + its assertion style; always `await`, no floating
  promises; fake timers + request mocks, never real waits or live calls.
- **Other**: copy the nearest existing test file's conventions; else the language's dominant tool
  (go test, cargo test, JUnit5, xUnit).

Output: "📝 Tests written. Verifying red state..."

### B1.5. Verify-red gate
Run ONLY the new test files once (detect the command with the B3 ladder). Confirm they FAIL.
- New tests FAIL → write the receipt with `red` filled in (real non-zero exit) and `"stage": "red"`.
  "🔴 Red state confirmed. Starting implementation..." → B2.
- New tests PASS with no implementation → STOP: "❌ Stopped at verify-red: new tests pass without
  implementation — they assert existing behavior and prove nothing. Revise the plan's test cases."
- Tests ERROR for an unrelated reason (import/config/collection) → report the exact error and STOP.
  Do not implement against broken tests.

### B1.6. Seed the gate keys  (skip unless the plan has a Gating section)
Tests are red and no implementation exists — the right seam to guarantee the gate exists before any
code is written against it. For each key the plan names:
- Write it to Firestore at `false` (toggle: `feature_toggles/config.<name>`; catalog: the `<name>`
  FIELD on the single `catalog/active` doc — merge-update it, never create a doc per entry, and
  never overwrite the whole doc). Use the project's own Firestore helper / venv python.
- **Read it back** and confirm the value is there and `false`. A write you did not read back is not
  a seeded key.
- Already exists → leave its current value alone (do not stomp a live toggle someone flipped) and
  record that it pre-existed.
- Cannot reach Firestore, or readback fails → STOP: "❌ Stopped at B1.6: could not seed/verify
  <key>." Do not implement gated code against a gate that may not exist.

Record the keys + readback in the receipt's `gating` block. Log: "🔒 Seeded <keys> = false".

### B2. Write implementation  (inline implementer)
Make the failing tests pass. Minimum needed — no extra code.

**Gated tickets:** the feature must read its gate through the project's ONE shared catalog/toggle
client with a fail-closed default (absent ⇒ off) — never an ad-hoc Firestore read in a screen. No
such client exists yet → build it as part of this ticket and note it; that shared reader is what
keeps twelve hand-rolled null checks from drifting into twelve behaviors.
1. Read the plan file. 2. **If the plan's `## Design Reference` names a mock, READ THAT IMAGE
   (the Read tool renders PNG/JPG) BEFORE writing any UI code** — see the mock rule below.
   3. Read every test file for the expected contracts. 4. Read the existing codebase for
   patterns. 5. Implement only what tests require. 6. Follow existing architecture strictly.

**Mock rule (UI tickets):** the referenced image is the visual contract and wins over prose on
any layout dispute, including the plan's own wording. Match layout, spacing, type scale, color,
component shape, iconography. NEVER substitute generic sample/placeholder UI when a mock exists
— that is the exact failure this rule prevents. Green tests are not sufficient for a UI ticket
with a mock: tests assert behavior, the mock asserts appearance, and both must hold. If the mock
contradicts a test, implement to the test and report the conflict. If the named mock path does
not exist on disk, say so explicitly — it means the design pack was never copied into the repo.

Stack rules (apply only the matching one):
- **Android/Kotlin**: MVVM ViewModel→Repository→DataSource; expose StateFlow (never public
  MutableStateFlow); Hilt for DI; no logic in Composables; no `!!` without a justifying comment.
- **Python**: no mutable default args; no bare `except:` — catch specific; match the codebase's
  typing discipline; no new module-level mutable state.
- **JS/TS**: no floating promises; strict `===`; no `any` unless the codebase already accepts it;
  match module style (ESM/CJS) exactly.
- **All**: the architecture that exists wins — extend existing layering/naming/error-handling;
  never add a new framework because it's "better".

File-modification rules (critical — you are editing real files now):
- NEVER `Write` an existing file. Modify existing files with surgical `Edit` calls only. `Write` is
  ONLY for brand-new files. Rewriting a large existing file risks output-token truncation and
  corruption.
- Large files (1000+ lines): read only the relevant ranges (offset/limit or Grep), not the whole
  file.
- Do NOT modify test files. Do NOT implement beyond what tests require. If the plan pins exact
  edits, apply them directly.

Output: "⚙️ Implementation done. Running tests..."

### B3. Test retry loop  (inline test-runner — YOU own the loop, max 5)

**B3 Step 0 — detect the test command (never guess), in order:**
1. `gradlew` present → `./gradlew test`
2. `pytest.ini` / `pyproject.toml` pytest config / a `tests/` dir → project venv's pytest if a venv
   exists (`.venv/bin/python -m pytest` on macOS/Linux, `.venv\Scripts\python -m pytest` on
   Windows), else `python3 -m pytest`
3. `package.json` with a `test` script → `npm test` (or pnpm/yarn per lockfile)
4. `go.mod` → `go test ./...`
5. `Cargo.toml` → `cargo test`
6. `pom.xml` → `mvn -q test`; `build.gradle(.kts)` without wrapper → `gradle test`
7. `Makefile` with a `test` target → `make test`
8. A project CLAUDE.md / CI config naming an explicit test command → use it (overrides 1-7)

State which command you picked and why. Nothing matches → STOP: "FAIL — no recognized test setup".

**The loop (attempt counter starts at 1, max 5):**
Run the detected command.
- All pass → update the receipt with `green` (cmd, real exit 0, attempts = N) and
  `"stage": "green"`. "✅ All tests passed on attempt [N]. Starting code review..." → B4.
- Failures:
  - Read the failure output. Read the failing test (expected contract). Read the implementation
    file causing the failure. Fix the IMPLEMENTATION only — never tests. Re-run ONCE to confirm.
  - Fixed → update the receipt with `green` as above. "✅ All tests passed on attempt [N]. Starting
    code review..." → B4.
  - Still failing and attempt < 5 → increment, "🔄 Tests failed. Attempt [N]/5 — retrying...",
    try a DIFFERENT fix (never repeat a failed one). Track what each attempt tried.
  - attempt == 5 and still failing → print the FAIL diagnosis (failing tests + exact errors; what
    each of the 5 attempts tried; most-likely root cause) + "❌ Stopped at B3. Fix the issues above
    and re-run the pipeline." Write the failing `green` entry (real non-zero exit, attempts = 5) and
    leave `"stage": "green"` — NOT "complete". `/ship` will refuse on it, which is the point.
    STOP — do not proceed to B4.

The receipt's `green` must come from a run YOU executed and read the exit code of — not from a
recollection of an earlier run in this thread.

Never skip/comment/delete tests. Never `Write` an existing file — surgical `Edit` only.

### B4. Code review — LAUNCH THE REVIEW AGENT DIRECTLY (independent context matters)

**Why the agent, not inline:** everything B0–B3 was written by THIS context — the same thread that
wrote the tests and the implementation. A reviewer sharing that context inherits its blind spots and
confirmation bias: it already "knows" why the code is right, so it under-scrutinizes exactly what a
fresh reader would catch. The author must not be the sole reviewer of their own code. So the review
step **spawns the `code-review-coordinator` agent directly — no ask.** The agent has an independent
context, runs parallel specialists, and adversarially verifies; that reviewer ≠ author property is
the whole point, so it is not optional and there is no inline-vs-agent question to the user.

**B4-AGENT (default — always do this):**
Spawn the `code-review-coordinator` agent via Task, passing the FULL working-tree diff at review
time (`git diff HEAD` + untracked new files — must include B3's fix edits). Wait for its report.
Apply the **Gate** rules below to its verdict. (Yes — this is a deliberate exception to the skill's
no-spawn rule, made precisely because review needs a context the author does not have.) Then skip
to **Gate**.

**B4-INLINE (fallback ONLY):** if the agent genuinely cannot run — not a git repo (no diff to hand
it), `code-review-coordinator` unavailable, or the user explicitly says "review inline" — run the
serial specialist passes below yourself. Treat a clean inline result with extra suspicion (it is the
author reviewing its own work). Do NOT ask the user which to use; default is always the agent.

This is the PER-TICKET gate: review the DIFF (changed code) + caller-context, not the whole
codebase. Pre-existing bugs in unchanged files are out of scope (that's `/deep-audit`). With no
parallel agents, run the specialist lenses one after another YOURSELF.

1. **Read + classify the diff.** `git diff HEAD` + untracked new files — this must include B3's fix
   edits, not just B1-B2. Identify language(s), platform, changed modules. Flag whether the diff
   touches:
   - money/trading/payment code (order, position, trade, price, level, PnL, balance, billing,
     broker, SL/TP) → money lens ON.
   - concurrency-sensitive code (thread, async, coroutine, lock, cache, background worker, a
     state-changing endpoint, shared mutable state) → concurrency lens ON.
2. **Build caller-context.** For each function the diff modifies, Grep its callers across the repo
   and Read the relevant snippets. Review bundle = diff + changed functions in full + direct
   callers. This is what catches interaction bugs.
3. **Run the lenses serially over the bundle** (each is a focused pass, not an agent):
   - **Security** (always): hardcoded secrets, injection, insecure storage, improper auth, exposed
     APIs, platform-specific security issues.
   - **Code quality** (always): SOLID violations, dead code, complexity, bad patterns, missing
     error handling, architecture anti-patterns.
   - **Money-logic** (if flagged): precision/unit errors, wrong-side orders, sentinel-value
     comparisons, non-idempotent close, balance/position accounting. If unsure whether the change
     could affect money/values/orders/balances, run it anyway — cheap insurance.
   - **Concurrency** (if flagged): races, staleness, double-fire, unguarded shared state.
   - **Kotlin best-practices** (if `.kt` files changed): idiomatic Kotlin, coroutine patterns, null
     safety, collection handling.
   - **Memory** (if allocation/lifecycle/streams/retained refs): leaks, resource leaks, lifecycle.
4. **Adversarial verify — CRITICALS only.** For each Critical you found, actively try to REFUTE it:
   read the actual code at file:line — is there a guard, invariant, caller contract, or existing
   test that prevents it? Three outcomes, kept distinct:
   - **Actively refuted** (you found the guard/invariant/test that prevents it) → downgrade to a
     warning, naming the guard you found.
   - **Confirmed** → stays 🔴 Critical, `✅ verified`.
   - **Could not reach a verdict** (ambiguous, could not read enough) → stays 🔴 Critical,
     `⚠️ unverified`. **NOT a downgrade** — "nobody could check" is not evidence of safety.
   Never treat an absent verdict as a refutation; that walks the pipeline past every Critical too
   hard to evaluate. Do NOT verify warnings/suggestions — too costly for low stakes.
5. **Compile the report:**
   - **🔴 Critical (hard-stop):** file:line, the bug, concrete failure, fix direction,
     ✅ verified / ⚠️ unverified.
   - **🟡 Warning (should fix):** memory/perf/bad patterns/concurrency risks + any REFUTED critical
     (naming the guard that refuted it). An unverified critical does NOT belong here.
   - **🟢 Suggestions:** style/readability/architecture (Kotlin findings mapped by severity).
   - **✅ Passed Checks:** which lenses looked at what and found clean.
   - **Scope note:** "Per-ticket diff review (+ caller-context). Pre-existing bugs in unchanged
     files out of scope — covered by /deep-audit. A clean report ≠ whole codebase clean."

**Gate:**

Whatever the verdict — agent or inline path — update the receipt with `review`: `critical` = count
of 🔴, `warnings` = count of 🟡, `unverified` = how many of those Criticals are marked
`⚠️ unverified`, and `warning_list` = one short `file:line what` string per warning (this is what
`/ship` prints before asking whether to ship anyway). Set `"stage": "reviewed"`. Count what the
report says: a Critical you disagree with is still a Critical in the count. `unverified` is a
SUBSET of `critical`, not a separate downgraded bucket.

- Any 🔴 Critical → print the full report + "❌ Stopped at B4. Critical issues found. Fix them, then
  RE-RUN B4 on the full updated diff before any commit — a Critical fix is code and must pass the
  same gate. Tests passing is not a substitute." STOP. Do not proceed to B5.
- **Critical-fix loop-back (mandatory):** ANY code change made after B4 ran — a Critical fix, a
  warning cleanup, a one-line tweak, however small, by anyone — invalidates the review verdict.
  B4 MUST re-run on the full current diff before B5. No exceptions "because the fix is exactly what
  was prescribed" — you verify that by re-reviewing, not by trusting.
  The same applies to the receipt: a post-B4 edit invalidates `green` AND `review`. Re-run B3's
  suite and B4's review, and overwrite both entries from the new runs. Never carry a `green`
  forward across a code change — that is exactly the staleness `/ship` exists to catch.
- Only 🟡/🟢 (no Critical) → print the report + "⚠️ Review complete with N warnings. Proceeding to
  commit message. Recorded in the receipt; `/ship` will surface them and ask before opening the
  PR." → B5. (Do NOT say "address warnings before pushing" — nothing here enforces it, and an
  instruction nobody checks trains people to ignore the ones that matter.)
- Clean → "✅ Code review passed." → B5.

### B5. STOP at the ship gate
The pipeline ends at code review. Do NOT write a commit message here: `/ship` scopes the commit
first (splitting files, dropping unrelated hunks), so a message written now would describe a diff
that is not what gets committed — and if the receipt gate fails, it describes work that never ships.
`/ship` spawns `changelog` against the STAGED diff instead.

Finalize the receipt: re-stamp `sha` and set `"stage": "complete"`. This is the only point at which
`complete` may be written. Then:

"✅ Inline pipeline complete. Nothing committed. Receipt: `tasks/receipts/<TICKET>.json`
Run `/ship` when ready — it reads the receipt, refuses if anything above is red or stale, then
scopes, writes the commit message, commits, pushes, opens the PR, and moves the ticket to In Review."

Do NOT commit, push, tag, merge, or deploy here. The ship gate is a hard stop — the user drives it.

---

## Rules (whole skill)
- NO `Task`/subagent spawns for pipeline work, with TWO deliberate exceptions: (1) read-only
  `Explore` in A1 for research breadth, and (2) the `code-review-coordinator` agent in B4, launched
  DIRECTLY (no ask) — because a reviewer must not share the author's context. Everything else B0–B5
  is main-thread.
- Never write the plan file before approval.
- Never `Write` an existing file — surgical `Edit` only. `Write` is for brand-new files.
- Never modify test files during B2/B3 — fix implementation only.
- Honor every hard stop (verify-red, 5-attempt cap, Critical review, ship gate). No skipping stages.
- The receipt records observations, never intentions: real exit codes, real counts, written only
  after the stage ran. Writing `"stage": "complete"` on a run that stopped early defeats the gate.
- If any stage fails unexpectedly, report which stage and stop.
- After modifying code files, if the project uses graphify, run `graphify update .` to keep the
  graph current (per project CLAUDE.md).
