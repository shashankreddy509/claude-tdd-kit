# claude-tdd-kit

[![validate](https://github.com/shashankreddy509/claude-tdd-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/shashankreddy509/claude-tdd-kit/actions/workflows/ci.yml)

**An AI coding agent will tell you it's done when it isn't.** It writes the code, writes tests
that pass because they only assert what the code already does, reviews its own diff, finds
nothing, and reports success. The build is green and nothing has been proven.

This kit turns each of those claims into something that can be checked. Every stage leaves
evidence on disk, and the next stage refuses to continue without it.

### Before / after: shipping a ticket

| | Without the kit | With `tdd-pipeline` |
|---|---|---|
| Tests | Written after the code, pass first time | Stage 1.5 runs the new tests **before any implementation exists** and requires a non-zero exit. Tests that already pass stop the run: *"they assert existing behavior and prove nothing."* |
| Evidence | The model says "all tests pass" | The real process exit codes go into `tasks/receipts/<TICKET>.json`: `red.exit`, `green.exit`, the command that ran, and the HEAD `sha` |
| Review | The same context that wrote the code reads it | Separate specialist reviewer agents check the diff plus its callers. Every Critical finding goes to a verifier that tries to refute it |
| Opening the PR | Happens whenever the model decides it's finished | `/ship` reads the receipt and **refuses** if it's missing, if `stage != "complete"`, if `sha` is stale, if `red.exit == 0` (the tests never failed), if `green.exit != 0`, if any Critical is confirmed or unverified, or if review found any 🟠 Must-fix |

A model can talk its way past a rule written in markdown. It can't create a receipt file that
doesn't exist or a `sha` that matches a HEAD that has moved.

---

## What it is

Two Claude Code plugins, installed from one marketplace. Each one works on its own:

- **dev-day** is the session loop. `/start-session` loads the corrections you've given in
  earlier sessions and turns on a standing plan-gate: no code edit until a plan is approved.
  `/end-session` saves what the session learned for the next one. Standup, bug triage,
  grooming, ticket creation and Jira comments are covered in between.
- **tdd-pipeline** is the gated build: ticket → plan (you approve it) → failing tests →
  verify-red → implement → test retry loop → specialist review → receipt → `/ship`.

---

## Android / Kotlin coverage

The pipeline auto-detects the stack. Android/Kotlin has the most specific rules, and these are
the files where they live.

### `kotlin-best-practices` reviewer ([agent](./tdd-pipeline/agents/kotlin-best-practices.md))

The review coordinator starts this reviewer only when the diff touches `.kt` files, and passes
it only the changed Kotlin files. It is read-only. It checks:

- **Null safety:** `!!` without a justification, unhandled Java platform types, unsafe `as`
  where `as?` belongs.
- **Coroutines and Flow:** `GlobalScope` instead of `viewModelScope`/`lifecycleScope`,
  `runBlocking` on the main thread, I/O without `withContext(Dispatchers.IO)`, Flow collected
  without `repeatOnLifecycle`/`flowWithLifecycle`, fire-and-forget `launch` with no
  `CoroutineExceptionHandler`, `suspend` functions that never suspend, and hot vs cold
  `StateFlow`/`SharedFlow` misuse.
- **State exposure:** a ViewModel exposing `MutableStateFlow`/`MutableLiveData`, public
  mutable collections, data classes with mutable properties.
- **Jetpack Compose:** unstable parameters that force recomposition, state read at too high a
  scope, a missing `remember` on expensive work, side effects outside
  `LaunchedEffect`/`DisposableEffect`, and state mutated during composition.
- Idiomatic Kotlin, collections/sequences, the type system and scope functions. Each finding
  comes with a severity, `File.kt:line`, the reason it matters and the idiomatic fix.

### `memory-analyzer`: Android lifecycle and leaks ([agent](./tdd-pipeline/agents/memory-analyzer.md))

The coordinator starts it when the diff involves allocation, lifecycle, streams or retained
references. Its Android section checks for:

- static references to an Activity, Fragment or View (Context leaks), and a ViewModel holding a
  `Context` instead of the application context
- a `Handler`/`Runnable` that is never removed in `onDestroy`, and a `BroadcastReceiver`
  registered but never unregistered
- a `Cursor`/`InputStream`/`OutputStream` that isn't closed in `finally`
- a Bitmap loaded without `inSampleSize` or never recycled
- coroutines in `GlobalScope` or another non-cancellable scope, and Flow collected outside
  `lifecycleScope`
- RecyclerView adapters that keep strong references to item views

It also checks Kotlin/JVM leaks, such as lambdas capturing the outer class, large
companion-object state and uncleared ThreadLocals. Each finding states *when* the leak shows up,
for example on rotation, backgrounding or repeated navigation.

### Android tests and Gradle

- **Test command detection** ([build-coordinator](./tdd-pipeline/agents/build-coordinator.md)):
  resolved once for any stack. A `Test:` line in `CLAUDE.md` wins, then the CI config's test
  step, then build files, where `gradlew` gives `./gradlew test` and a `build.gradle(.kts)`
  without a wrapper gives `gradle test`. If nothing matches, it stops and never guesses.
- **Test-writer rules for Android:** the suite's existing framework (JUnit4 + MockK by default), `kotlinx-coroutines-test` for suspend
  functions, a `MainDispatcherRule`, Turbine for ViewModel `StateFlow` emissions, and
  `advanceUntilIdle()` instead of `Thread.sleep()`.
- **Implementer rules for Android:** MVVM (ViewModel → Repository → DataSource), the project's DI framework (Hilt by default),
  `StateFlow` exposed without leaking `MutableStateFlow`, no business logic in Composables, no
  unjustified `!!`.
- **Gradle pitfalls written into the commands:** `/build` checks that a verification task
  exists before it goes into the plan. An Android-library-based KMP module runs
  `:shared:testDebugUnitTest`, not `:shared:jvmTest`. `/ship` counts test results from one
  variant only, because Android runs each unit-test class under both debug and release, and
  summing every `TEST-*.xml` doubles the count (65 real tests reported as 130).
- **Attributing a failure** ([prove-pre-existing](./dev-day/skills/prove-pre-existing/SKILL.md)):
  stashes your edits, re-runs the same `./gradlew :module:testDebugUnitTest` on the clean base
  and compares the error signatures. It reads kapt/Gradle traces bottom-up, from the real
  `Caused by` / `e:` lines. Kotlin compiles a whole source set as one unit, so one broken file
  fails the set even when the change is unrelated.
- **Android security checks** ([security-reviewer](./tdd-pipeline/agents/security-reviewer.md)):
  secrets in `local.properties`/`BuildConfig`/`strings.xml`, exported manifest components with
  no permission check, a WebView with JavaScript enabled on untrusted URLs, unencrypted PII in
  SharedPreferences, and `allowBackup=true` when the app holds sensitive data.

Other stacks work too: Python, JS/TS, Go, Rust, JVM, .NET, PHP and Ruby each have their own
detected test command and rule sections.

---

## Design decisions

### Approval is gated, not autonomous

`/build` presents a plan and waits for explicit approval before editing any file. After
approval, edits that match the plan go ahead without asking again. A change in approach, or a
file outside the plan, needs a new check.

**Why:** running a wrong plan autonomously costs more than the approval round. The expensive
failure isn't one bad edit. It's twenty good edits built on a misread requirement.

**What it costs:** a human has to approve every build. This kit is deliberately not a "fire and
forget" agent.

### Tests must fail before they are allowed to pass

Stage 1.5 (`verify-red`) runs the new tests and requires a non-zero exit. If the tests pass
with no implementation, they are rejected and the run stops.

**Why:** a test that passes immediately asserts behavior that already existed. It proves
nothing about the change, yet it makes the suite green. That is worse than no test, because
everyone downstream trusts green.

### Review is split into specialists, not one reviewer

The review coordinator builds a bundle of the diff, the changed functions in full, and their
direct callers. It then starts specialists in parallel. `security` and `code-quality` always
run. `money-logic`, `concurrency`, `memory-analyzer` and `kotlin-best-practices` run only when
the diff calls for them. Each specialist works from a narrow, written taxonomy.

Findings that are not yet bugs but must not ship are reported as 🟠 **Must-fix**: dead code,
duplicated logic, a planned file the diff never touched, new code nothing calls, a success
message not gated on the result, and sensitive data in logs or output. They stop the pipeline
like a Critical, but skip the verify pass: the reviewer's cited evidence (caller grep, every
copy's `file:line`, the untouched plan file) is the proof.

**Why:** a single general-purpose reviewer drifts toward whatever is easiest to spot, which is
formatting. A narrow scope with a written checklist keeps a reviewer on the kinds of bug that
actually cause outages.

The money-logic and concurrency specialists weren't picked by intuition. They were added after
a whole-codebase audit found the worst bugs clustered in exactly those two areas: money math and
shared mutable state. Their checklists name the specific bug types that audit found. For
example, money-logic checks for sentinel-value comparisons: a `price >= tp` test where an unset
`tp == 0` makes the condition always true. That bug type caused a critical production bug, so
it's now a named line item instead of something a reviewer might happen to notice.

### Critical findings are adversarially verified before they are reported

Every finding rated Critical goes through a verification pass that tries to refute it. A
finding that survives is reported as Critical. A finding the pass reached **no verdict** on is
still a hard stop.

**Why:** a plausible but wrong Critical does more damage than a missed one, because after two
false alarms nobody reads the review. And "nobody checked" isn't evidence of safety. An
unverified Critical is treated as Critical, not downgraded to a warning. Only a Critical the
verifier actively refutes becomes a warning.

### The ship gate reads a file on disk, not the conversation

`/ship` refuses to open a PR unless `tasks/receipts/<TICKET>.json` shows the run actually
happened. It stops on any of these:

- the receipt is missing, or `stage != "complete"`
- the `sha` is stale (HEAD moved after the last verified run)
- `green.exit != 0`
- `red.exit == 0` (the tests never failed, so they prove nothing)
- any `review.critical`, any `review.must_fix`, or any
  `review.unverified`
- a feature-gate block whose read-back failed

Warnings print in full with `file:line` and ask before shipping, never as a bare count, because
an unread warning is the same as no warning.

**Why this is the most important decision in the repo:** a model can talk itself into believing
the tests were "basically passing." It can't create a file that isn't there or a `sha` that
matches. The receipt records the **real process exit code**, not the model's reading of the
output. A suite that prints "2 failed" and exits 1 is recorded as `"exit": 1`.

The pipeline and the ship command both state the same rule: a receipt is a record, not a
permission slip. Never write or edit one to get past the gate. If the gate is wrong, fix the
gate.

### One execution model: the agent pipeline

An inline variant (`/inline-build`) existed until 2026-08-23. It ran the same stages in the main
thread without starting subagents. It was removed by owner ruling because sessions kept using
it in place of the agent pipeline, and a context close to the author reviewing freshly written
code is exactly the failure this kit exists to prevent. `/build` → `/implement` →
build-coordinator is the only way a plan becomes code.

### Nothing about the tracker is hardcoded

The Jira cloudId, site URL, project key and workflow transition ids are all resolved at runtime
from a single `Jira: cloudId=<uuid> key=<KEY>` line in the repo's `CLAUDE.md`. Transitions are
matched on `to.name`, never on an id.

**Why:** transition ids differ between projects even on the same Atlassian site, and the MCP
tool surface differs between servers. Anything hardcoded works on exactly one board. With no
`Jira:` line, the git steps still run and the ticket steps are skipped.

---

## The two plugins

| Plugin | What it does |
| --- | --- |
| **[dev-day](./dev-day)** | The session loop. `/start-session` starts a session with the feedback you've accumulated, the Jira backlog and the standing plan-gate. `/standup` answers "anything pending?". `/shape-idea` argues a raw idea into a paste-ready prompt, and `/groom-panel` runs a business analyst, UI designer, developer and tester on it to file a groomed Epic and tickets. `/bug-triage` finds a ticket's root cause, `/groom` prepares it, `/create-ticket` files it, and `/jira-comment` posts comments that survive MCP markdown mangling. `/end-session` saves what the session learned to `tasks/feedback.md` for the next one. |
| **[tdd-pipeline](./tdd-pipeline)** | The build. `/build` plans and waits for approval. `/implement` runs test-writer → verify-red → implementer → test-runner → implementer fix loop (at most 5 fix rounds) → specialist review, then auto-runs `/ship` on a complete receipt. `/ship` checks the receipt, writes the commit message from the staged diff, opens the PR and moves the ticket to In Review. `/merged` verifies the merge and cleans up. `/validated` records your sign-off and closes the ticket. |

`/validated` is the only command that moves a ticket to Done, so Done means *validated on a real
build*, not just *merged*.

Merging and deploying are still up to you. `/ship` never merges, and `/merged` never deploys.

Each plugin's own README has the full command list and the stage-by-stage flow.

---

## Mods

Four optional Claude Code mods (hook plugins that draw inside the terminal or the desktop Code
tab) live under `mods/`. Each installs on its own and needs neither plugin above, except where noted.

- **side-panel**: a right-side dashboard pane for the project the session is open in. Count
  tiles, the session's agents, the current topic, and a
  "Left undone" card that collects TODOs and skipped tests Claude writes into files; click an entry to put "You left this undone: ... Do it now." in the
  prompt box. The Jira card lists the project's open tickets by status, caught from the search
  `/start-session` already runs for the repo's `Jira: cloudId=... key=KEY` line (no setup).
  Needs-you and todos cards appear only after you set their URLs in `/config` (`needs_url`,
  `todos_url`). The Agents card shows Cost / Tokens / Time tiles and a card per running agent:
  a pixel avatar (a face emoji in the terminal), model · effort, context %, tokens, its share of
  the session cost and elapsed time; finished agents fold into one "Finished" line. Cost is an
  estimate (the session's $ split by tokens), and context % shows only when the agent runs the
  session's model. The pane docks in the fullscreen layout from 144 columns.
- **cache-keeper**: a band above the prompt with the prompt-cache countdown, the cost of a cold
  rewrite, 5h / weekly usage, what is eating the context (with a trim hint), and handoff buttons.
  It assumes a 60-minute cache TTL; set yours with `/cachekeeper ttl <minutes>`. The handoff
  buttons run `dev-day:end-session`, so they need dev-day installed.
- **next-steps**: turns the numbered list under a bold **Questions** heading at the end of a
  reply into answer buttons (1-9 answer, 0 sends the picks as one reply). It does nothing for
  replies without that block, so it pairs with a reply format that ends in one.
- **secret-guard**: checks each prompt before it is sent against the regexes in
  `~/.claude/secret-patterns.json` (a JSON array of `{ "kind", "pattern", "flags" }`) and, on a
  hit, asks Mask, Send anyway or Cancel; the dialog shows only the kinds, never the value. It
  fails closed: with no pattern file it uses a built-in list of 14 common key formats, and a
  pattern file that is present but broken holds every prompt until fixed.
  `node mods/secret-guard/check-patterns.mjs` tests your file against fake samples.

```
/plugin install side-panel@claude-tdd-kit
/plugin install cache-keeper@claude-tdd-kit
/plugin install next-steps@claude-tdd-kit
/plugin install secret-guard@claude-tdd-kit
```

Hide or show a mod for the current session with `/sidepanel` (opens or closes the pane),
`/cachekeeper on|off`, `/nextsteps on|off` or `/secretguard on|off`. To turn one off for good, use
`claude plugin disable <mod>@claude-tdd-kit` (and `enable` to bring it back).

Each mod's logic has `*.test.ts` files; run them with `claude plugin test mods/<name>`. CI does
not run them.

---

## Install

```
/plugin marketplace add shashankreddy509/claude-tdd-kit
/plugin install dev-day@claude-tdd-kit
/plugin install tdd-pipeline@claude-tdd-kit
```

Each plugin installs and works on its own. `dev-day` handles the ticket lifecycle and
`tdd-pipeline` runs the build stages. Jira is optional: add the `Jira:` line to `CLAUDE.md` to
turn on the ticket steps.

---

## What's tested

A plugin here is markdown, not executable code, so there's no unit test to run. What *can* break
silently is the wiring, and every one of those failures ships green and only shows up when
someone installs the plugin. `tests/validate.sh` runs on every push, every PR and every release
tag:

| Check | Catches |
| --- | --- |
| Manifests parse | A trailing comma that makes the marketplace impossible to add |
| Marketplace sources resolve | A plugin directory renamed or moved without updating `marketplace.json` |
| Referenced agents exist | A coordinator starting an agent whose file was renamed, so the stage silently never runs |
| Frontmatter name matches filename | An agent that can't be resolved when it's started |
| Shell scripts parse | `bash -n` + shellcheck on every bundled script |
| Versions agree | The two plugins drifting apart, or disagreeing with the release tag |

Each check is mutation-tested: the defect is introduced, the check is confirmed to fail with a
non-zero exit, and the tree is restored. That process found a bug in the validator itself: a
piped `while read` ran in a subshell, so a real failure printed but still exited 0.

Run it locally with `tests/validate.sh`, or with `tests/validate.sh --tag v1.4.0` to include the
release-tag check.

## Layout

Both plugins live in this repo as subfolders, so installing needs only a single HTTPS clone of
the kit, with no SSH key and no second clone:

- `dev-day/`: the session-loop plugin
- `tdd-pipeline/`: the build pipeline plugin
- `mods/`: the four optional mods (side-panel, cache-keeper, next-steps, secret-guard)

This kit is the canonical install source.

## License

MIT
