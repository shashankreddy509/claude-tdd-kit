# dev-day

The complete developer day-loop for Claude Code + Jira. One plugin, seven commands, and your
session runs the way a disciplined senior engineer's day runs: boot with context, work gated,
ship clean, capture what you learned.

Pairs with [tdd-pipeline](../tdd-pipeline) (the gated build/test/review stages), which ships
in this same kit. dev-day runs the day; tdd-pipeline builds the tickets.

## The loop

| When | Command | What it does |
|---|---|---|
| Morning | `/dev-day:start-session` | Senior-collaborator operating rules, loads `tasks/feedback.md` (your accumulated corrections), pulls the Jira backlog, arms the standing **plan-gate**: code changes need an approved plan first; read-only work runs immediately |
| Anytime | `/dev-day:standup` | "Anything pending?" — branch + dirty files, open PRs, deploy gap, open Jira issues. Read-only |
| New bug | `/dev-day:bug-triage <KEY>` | Root-cause verdict + fix location, adversarially confirmed. Read-only, writes one triage artifact |
| Before estimating | `/dev-day:groom <KEY>` | Readiness + spec brief. No estimates, no Jira edits |
| New work | `/dev-day:create-ticket` | Drafts a properly-formatted ticket, creates ONLY after you approve |
| Build one | `/tdd-pipeline:build <KEY>` then `/tdd-pipeline:implement` | Hands the ticket to the tdd-pipeline plugin: plan → your approval → test-writer → implementer → test-runner → review → ship gate |
| Jira notes | `/dev-day:jira-comment` | Posts comments that survive the Atlassian MCP's markdown mangling |
| Evening | `/dev-day:end-session` | Captures the session's corrections + lessons into `tasks/feedback.md` (via `merge-feedback`, never deletes prior points) and leaves a "left off here" note for tomorrow |

## Setup

1. Install (via the [claude-tdd-kit](https://github.com/shashankreddy509/claude-tdd-kit)
   marketplace — the canonical install source; this repo is a mirror):
   ```
   /plugin marketplace add shashankreddy509/claude-tdd-kit
   /plugin install dev-day@claude-tdd-kit
   ```
2. Connect the [Atlassian MCP](https://www.atlassian.com/platform/remote-mcp-server) (Jira access).
3. Add one line to your repo's `CLAUDE.md`:
   ```
   Jira: cloudId=<your-cloud-id> key=<PROJECTKEY>
   ```
   (`getAccessibleAtlassianResources` returns your cloudId.) No line = the skills that need
   Jira say so and stop; the rest work anyway.

## The two ideas that make it work

**The plan-gate.** `start-session` arms a standing rule for the whole day: any task that
changes code gets analysis + a concrete plan + your explicit approval BEFORE any edit.
Read-only work and non-code artifacts run immediately. Approved plans execute without
re-asking; new scope needs a fresh check.

**The feedback loop.** Corrections you give today change behavior tomorrow:
`end-session` merges them into `tasks/feedback.md` (superset merge, never deletes),
`start-session` loads them silently the next morning. The file is repo-local and yours.

## Files the plugin maintains in your repo

- `tasks/feedback.md` — accumulated preferences/corrections (the memory)
- `tasks/session-notes.md` — 2-line "left off" note between sessions
- `tasks/<KEY>-triage.md`, `tasks/<KEY>-grooming.md` — per-ticket artifacts
- `tasks/plans/<KEY>_plan.md` — approved plans (written by `tdd-pipeline`)

## License

MIT
