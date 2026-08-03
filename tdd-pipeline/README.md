# tdd-pipeline

Gated TDD build pipeline for Claude Code, packaged as a plugin. Works on any
stack — Android/Kotlin, Python, JS/TS, Go, Rust, JVM, .NET, PHP, Ruby, or
generic — via stack-detected test commands and per-stack rule sections.
Surgical edits over file rewrites, a coordinator-owned retry loop, a verify-red
stage that rejects tests passing without implementation, full-diff review scope,
and a critical-fix loop-back that re-reviews any post-review edit.

## Flow

```
/tdd-pipeline:build <TICKET> <description>
  → explores code (or reuses tasks/<TICKET>-triage.md for bugs)
  → presents plan inline
  → AskUserQuestion approval (approve+run / approve only / revise / cancel)
  → writes tasks/plans/<TICKET>_plan.md
  → build-coordinator:
      Stage 1    test-writer          (failing tests from the plan)
      Stage 1.5  verify-red           (new tests MUST fail; vacuous green = stop)
      Stage 2    implementer          (surgical Edit only, never rewrite files)
      Stage 3    test retry loop      (coordinator-owned, ≤5 fresh runner spawns,
                                       prior diagnosis passed forward)
      Stage 4    code review          (full working-tree diff; security + quality
                                       always; money-logic + concurrency when the
                                       diff warrants; Criticals adversarially
                                       verified; hard stop on Critical; any
                                       post-review edit re-enters Stage 4)
      Stage 5    changelog            (commit message from the plan file)
```

`ship` then carries that commit message through to a branch, a commit, a push and
a PR, and moves the ticket to In Review. After you merge, `merged` closes the loop.

```
/tdd-pipeline:ship            → branch → commit → push → PR → ticket In Review
  (you review and merge the PR)
/tdd-pipeline:merged          → verifies the merge, parks the ticket in the
                                board's verification column, syncs the default
                                branch, deletes the merged branch
  (you validate on a real build)
/tdd-pipeline:validated       → records what you verified, moves the ticket to Done
```

`validated` is the only command that moves a ticket to Done — so Done means
*validated*, not merely *merged*. On boards with no verification column there's
nothing to gate on, and `merged` closes the ticket directly.

Merging and deploying stay yours: `ship` never merges, and `merged` never deploys
(deploy paths are project-specific — tags, pipelines, hosts).

Jira is optional throughout. With no ticket key and no `Jira:` line in CLAUDE.md,
the git half still runs and the ticket steps are skipped. Nothing is hardcoded —
cloudId, site, and transition ids are all discovered, because workflows differ
between projects even on the same site.

## Commands
- `build` — plan inline, iterate, click-approve, auto-hand off to the pipeline
- `implement` — run the pipeline against an approved plan file
- `review` — run the review gate standalone on the current diff
- `ship` — branch, commit, push, open the PR, move the ticket to In Review
- `merged` — after you merge: verify it, park the ticket for validation, sync the
  default branch, delete the merged branch (asks before each destructive step)
- `validated` — after you verify on a real build: record the note, move to Done

## Agents
build-coordinator, test-writer, implementer, test-runner,
code-review-coordinator, security-reviewer, code-quality-reviewer,
money-logic-reviewer, concurrency-reviewer, memory-analyzer,
kotlin-best-practices, planner, changelog

## Test-command detection
test-runner and the verify-red stage auto-detect the suite, in order: `gradlew` →
`./gradlew test`; pytest project → the venv's pytest (or `python3 -m pytest`);
`package.json` → `npm test`; `go.mod` → `go test ./...`; `Cargo.toml` → `cargo test`;
`pom.xml` → `mvn -q test`; `.csproj`/`.sln` → `dotnet test`; `composer.json` →
`vendor/bin/phpunit`; `Gemfile` → `bundle exec rspec`; a `Makefile` test target →
`make test`. A test command named in CLAUDE.md or CI config overrides all of them.
No match = ask for the command, never guess one.

## Install

Via the [claude-tdd-kit](https://github.com/shashankreddy509/claude-tdd-kit) marketplace
(the canonical install source; this repo is a mirror):

```
/plugin marketplace add shashankreddy509/claude-tdd-kit
/plugin install tdd-pipeline@claude-tdd-kit
```

Commands then resolve as `/tdd-pipeline:build`, `/tdd-pipeline:implement`,
`/tdd-pipeline:review`.

Note: if you also keep loose copies of these commands/agents in `~/.claude/`,
both will be available (loose `/build` vs namespaced `/tdd-pipeline:build`).
Use one or the other per machine to avoid drift.

## Conventions the pipeline expects
- Plans live at `tasks/plans/<TICKET>_plan.md` (created by `build`)
- Optional bug path: a `tasks/<TICKET>-triage.md` root-cause artifact makes
  `build` skip re-exploration and write a lean fix-plan
- Optional companions referenced but not included: a `/bug-triage` skill (writes
  the triage artifact) and a periodic whole-codebase `/deep-audit` backstop.
  The pipeline works without them.
