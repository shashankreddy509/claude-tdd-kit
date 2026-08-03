# claude-tdd-kit

[![validate](https://github.com/shashankreddy509/claude-tdd-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/shashankreddy509/claude-tdd-kit/actions/workflows/ci.yml)

Two Claude Code plugins that make an AI coding agent accountable: **dev-day** runs the
developer day-loop, **tdd-pipeline** runs a gated build/test/review pipeline from ticket
to Done. Add one marketplace, install either plugin.

```
/plugin marketplace add shashankreddy509/claude-tdd-kit
/plugin install dev-day@claude-tdd-kit
/plugin install tdd-pipeline@claude-tdd-kit
```

Each installs and works on its own. `dev-day` runs the ticket lifecycle; `tdd-pipeline`
runs the build stages.

---

## The problem this solves

An agent that writes code and then reviews its own code has no independent check. It will
report success on a run that never proved anything: tests that passed because they assert
existing behavior, a review that found nothing because it was looking for style nits, a
"done" that means the model stopped rather than the work landed.

Every gate in this kit exists because that failure happened and cost real debugging time.
The design goal is not automation. It is **making an agent's claims falsifiable** — each
stage produces evidence the next stage can refuse to accept.

---

## Design decisions

### Approval is gated, not autonomous

`/build` presents a plan and stops for explicit approval before any file is edited.
Once approved, in-flight edits consistent with that plan proceed without re-asking; a
change in approach or a file outside the plan needs a fresh check.

**Why:** a wrong plan executed autonomously costs more than the approval round costs. The
expensive failure is not a bad edit, it is twenty good edits built on a misread requirement.

**What it costs:** a human in the loop on every build. This kit is deliberately not a
"fire and forget" agent.

### Tests must fail before they are allowed to pass

Stage 1.5 (`verify-red`) runs the newly written tests and requires a non-zero exit. Tests
that pass with no implementation are rejected and the run stops.

**Why:** a test that passes immediately is asserting behavior that already existed. It
proves nothing about the change, but it makes the suite green — which is worse than no test,
because green is what everyone downstream trusts.

### Review is split into four specialists, not one reviewer

`security`, `code-quality`, `money-logic`, and `concurrency` each run with a narrow,
explicit taxonomy. Money-logic and concurrency spawn only when the diff warrants them.

**Why:** a single general-purpose reviewer regresses to whatever is easiest to spot, which
is formatting. Narrow scope with a written checklist is what keeps a reviewer on the classes
that actually cause outages.

The two domain specialists were not chosen by intuition. They were added after a
whole-codebase audit found the worst bugs concentrated in exactly those two areas — money
math and shared mutable state. Their check-lists encode the specific bug classes that audit
surfaced. For example, money-logic checks for sentinel-value comparisons: a `price >= tp`
test where an unset `tp == 0` makes the condition always true. That class caused a critical
production bug, so it is now a named line item rather than something a reviewer might notice.

### Critical findings are adversarially verified before they are reported

A finding rated Critical goes through a verification pass that tries to refute it. Only a
finding that survives is reported as Critical. A finding the pass reached **no verdict** on
stays a hard stop.

**Why:** a plausible-but-wrong Critical is more damaging than a missed one, because after
two false alarms nobody reads the review. And "nobody checked" is not evidence of safety —
an unverified Critical is treated as a Critical, not downgraded to a warning. Only an
actively refuted one becomes a warning.

### The ship gate reads a file on disk, not the conversation

`/ship` refuses to open a PR unless `tasks/receipts/<TICKET>.json` says the run actually
happened. It stops on: a missing receipt, `stage != "complete"`, a stale `sha` (HEAD moved
after the last verified run), `green.exit != 0`, `red.exit == 0` (the tests never failed, so
they prove nothing), any `review.critical`, any `review.unverified`, or a feature-gate block
whose read-back failed. Warnings print in full with `file:line` and ask before shipping —
never as a bare count, because an unread warning is the same as no warning.

**Why this is the most important decision in the repo:** a rule written in a markdown
instruction is something a model can talk past. A model can convince itself the tests were
"basically passing." It cannot invent a file that is not there or a `sha` that matches. The
receipt records the **real process exit code**, not the model's reading of the output — a
suite that prints "2 failed" and exits 1 is recorded as `"exit": 1`.

Both the pipeline and the ship command carry the same rule in their own text: a receipt is a
record, not a permission slug. Never write or edit one to get past the gate. If the gate is
wrong, fix the gate.

### `/inline-build` is a second execution model, not a fallback feature

The same stages run entirely in the main thread with no subagent spawns. Same plan, same
verify-red, same receipt, same review gate.

**Why both exist:** subagents cost spawn overhead and lose context between stages, so each
one re-reads what it needs. The inline path trades parallelism for one continuous context
and one token pool. Which is cheaper depends on the ticket, so it is a choice rather than a
default. The one thing inline does *not* do is review its own work: the review step still
launches the review coordinator as a separate agent, because an author reviewing their own
code is the failure this kit exists to prevent.

### Nothing about the tracker is hardcoded

Jira cloudId, site URL, project key and workflow transition ids are all resolved at runtime
from a single `Jira: cloudId=<uuid> key=<KEY>` line in the repo's `CLAUDE.md`. Transitions
are matched on `to.name`, never on an id.

**Why:** transition ids differ per project even on the same Atlassian site, and the MCP tool
surface itself differs between servers. Anything hardcoded works on exactly one board.
With no `Jira:` line the git half still runs and the ticket steps are skipped.

---

## The two plugins

| Plugin | What it does |
| --- | --- |
| **[dev-day](./dev-day)** | The day-loop. `/start-session` boots a session with accumulated feedback, the Jira backlog, and the standing plan-gate. `/standup` answers "anything pending?". `/bug-triage` root-causes a ticket, `/groom` preps it, `/create-ticket` files it, `/jira-comment` posts comments that survive MCP markdown mangling, `/end-session` captures what the session learned into `tasks/feedback.md` for tomorrow. |
| **[tdd-pipeline](./tdd-pipeline)** | The build. `/build` plans and waits for approval; `/implement` runs test-writer → verify-red → implementer → test-runner retry loop → multi-specialist review → changelog; `/ship` gates on the receipt, opens the PR, moves the ticket to In Review; `/merged` verifies the merge and cleans up; `/validated` records your sign-off and closes it. |

`/validated` is the only command that moves a ticket to Done — so Done means *validated on a
real build*, not merely *merged*.

Merging and deploying stay yours. `/ship` never merges. `/merged` never deploys.

Each plugin's own README has the full command list and stage-by-stage flow.

---

## What's tested

A plugin here is markdown, not executable code, so there is no unit test to run. What *can*
break silently is the wiring — and every one of those failures ships green and only surfaces
at a user's install. `tests/validate.sh` runs on every push, every PR, and every release tag:

| Check | Catches |
| --- | --- |
| Manifests parse | A trailing comma that makes the marketplace un-addable |
| Marketplace sources resolve | A plugin directory renamed or moved without updating `marketplace.json` |
| Referenced agents exist | A coordinator spawning an agent whose file was renamed — the stage silently never runs |
| Frontmatter name matches filename | An agent that cannot be resolved when spawned |
| Shell scripts parse | `bash -n` + shellcheck on every bundled script |
| Versions agree | The two plugins drifting apart, or disagreeing with the release tag |

Each check is mutation-tested: the defect is introduced, the check is confirmed to fail with
a non-zero exit, and the tree is restored. That process found a bug in the validator itself —
a piped `while read` ran in a subshell, so a real failure printed but still exited 0.

Run it locally with `tests/validate.sh`, or `tests/validate.sh --tag v1.4.0` to include the
release-tag assertion.

## Layout

Both plugins live in this repo as subfolders, so installing needs only a single HTTPS clone
of the kit — no SSH key, no second clone:

- `dev-day/` — the day-loop plugin
- `tdd-pipeline/` — the build pipeline plugin

This kit is the canonical install source.

## License

MIT
