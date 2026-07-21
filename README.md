# claude-tdd-kit

A Claude Code plugin marketplace bundling a complete developer workflow: the day-loop and the TDD build pipeline. Add one marketplace, install either plugin.

## Plugins

| Plugin | What it does |
| --- | --- |
| **dev-day** | The developer day-loop. `/start-session` boots a senior-collaborator session (feedback memory, Jira backlog, standing plan-gate), `/standup` answers "anything pending?", `/bug-triage` root-causes tickets, `/groom` preps them for estimation, `/create-ticket` files them, `/jira-comment` posts clean Jira comments, and `/end-session` captures what the session learned. Hand a groomed ticket to `tdd-pipeline` (`/tdd-pipeline:build` then `/tdd-pipeline:implement`) to actually build it. |
| **tdd-pipeline** | Gated TDD build pipeline. `/build` plans a feature or bug fix and waits for click-approval; `/implement` runs test-writer → implementer → test-runner → multi-specialist review (security, quality, money-logic, concurrency) → changelog; `/ship` gates the commit on a verification receipt, then posts the pipeline summary to Jira and moves the ticket to In Review. Also ships an `/inline-build` skill that runs the whole pipeline in one thread with no subagent spawns. |

`dev-day` runs the ticket lifecycle; `tdd-pipeline` runs the build stages. They pair, but each installs and works on its own.

## Install

```
/plugin marketplace add shashankreddy509/claude-tdd-kit
/plugin install dev-day@claude-tdd-kit
/plugin install tdd-pipeline@claude-tdd-kit
```

Install just one if that's all you need — they're independent.

## Layout

Both plugins live in this repo as subfolders, so installing needs only a single HTTPS clone of the kit — no SSH key, no second clone:

- `dev-day/` — the day-loop plugin
- `tdd-pipeline/` — the build pipeline plugin

This kit is the canonical install source.

## License

MIT
