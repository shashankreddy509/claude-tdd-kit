# Triage — <TICKET>

> Written by the `bug-triage` skill. Read-only investigation; no code changed, Jira untouched.
> This file is the planner contract: `/build` or `/inline-build` picks up the root cause +
> affected files below without re-exploring. The plan-gate still applies.

## Verdict

**<real-bug | not-reproducible | pre-existing | invalid>**

One-line statement of the verdict and the single most important reason.

## Ticket

- **Key:** <TICKET>
- **Type:** Bug
- **Assignee:** <name> — <"this is yours" | "assigned to someone else — investigation only">
- **Status / Priority:** <status> / <priority>
- **Parent epic:** <key — summary, if any>
- **Labels:** <labels>

## Repro (verbatim from the ticket)

- **Steps:** <steps>
- **Expected:** <expected>
- **Actual:** <actual>
- **One-line repro being root-caused:** <the exact scenario the verdict is about>

## Root cause (confirmed on disk)

The decision chain, origin → decision point → user-visible effect. Each line is a real, re-verified
`file:line` with a quoted snippet:

1. `path/File.ext:NN` — <what this line does>
   ```
   <quoted snippet>
   ```
2. `path/Other.ext:NN` — <the branch/default/gate that decides the wrong behavior>
   ```
   <quoted snippet>
   ```

(Use the real file extensions and a matching language fence for your stack.)

**Why it produces the bug:** <prose: how the chain yields Actual instead of Expected>.

**Fix lever (for the planner, not applied here):** <the existing helper/flag/method the fix should
use — e.g. "gate behind the existing feature flag", "read through the shared config accessor rather
than the raw settings object", or "n/a">.

## Affected files (fix scope)

- `path/File.ext` — <what changes>
- `path/Other.ext` — <what changes, if any>

## Excluded as adjacent / out of scope

Findings the search surfaced that are NOT this bug's cause (so the planner doesn't chase them):
- `path/Elsewhere.ext:NN` — <real smell, but belongs to <other flow>, not this repro>

## Suggested fix-plan seed (lean fix-plan; planner expands + user approves)

- **Root cause:** <one line>
- **Minimal change:** <the smallest edit that fixes it at the shared point, not per-caller>
- **Flag gate:** <new/existing feature flag in the project's own flag store, seeded OFF first with a
  byte-identical OFF fallback, or "n/a — pure correctness fix">
- **One test:** <the single check to leave behind — test name + what it asserts>
- **Callers to check:** <if the fix touches a shared helper, who else calls it>

## Triage self-check

`TRIAGE SELF-CHECK: <PASS | FAIL — misses>` — every cited file:line re-verified to exist with its
snippet; verdict is one of the four and matches the evidence; exclusions stated.
