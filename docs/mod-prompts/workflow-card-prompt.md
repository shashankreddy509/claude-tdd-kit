Build the Workflow card: a live side-panel card that follows one `/build` run of the tdd-pipeline from plan to PR, so you never scroll the chat to find where it is. Local build, no Jira (mods are not ticketed). Source repo: this repo (public). Branch off main as feat/workflow-card; open a PR, the owner merges.

Origin: a public reel ("Dashboard mod"), built on our own pipeline. Build AFTER the Ship band (docs/mod-prompts/ship-band-prompt.md): this card imports its `receipt.ts`. It replaces the "Pipeline stage grid" idea that was briefly in agents-tracker-prompt.md.

Read first: tdd-pipeline/commands/{build,implement,ship}.md, tdd-pipeline/agents/build-coordinator.md (stages ~130-293, receipt ~72-101), tdd-pipeline/agents/code-review-coordinator.md, mods/side-panel/hooks/{register.tsx,panel.ts,look.ts} + tests, mods/side-panel/types/index.d.ts, and the API types (grep). Load the `plugin-authoring` skill before writing hooks.

## Reference look (from the reel)
Header "WORKFLOW <KEY>" + title + live dot · "11 of 13 steps done · 85%" segmented bar (green done, orange running, grey waiting) · "Iteration 2 · 24 stage runs" · readiness rows ("Ready for a pull request: no/yes") · NOW card (spinner + stage name + one-line description) · an approval card when it needs a yes ("Extra round approved · Resuming correction stage") · stage cells with round badges ("r2") · PR row "waiting for reviews" → "PR ready" + a manual checklist.

## What exists today (measured 2026-10-09, kit HEAD 93eee48)
- The pipeline writes only `tasks/plans/<KEY>_plan.md` (after approval) and `tasks/receipts/<KEY>.json` (at stage boundaries: red, green, reviewed, complete). `tasks/` is gitignored.
- Key = plan filename; title = the plan's `# Feature: <name>` heading. No Jira fetch.
- Live stage: `$.agent.list()` gives `id`, `description`, `type` per agent (type value not yet seen live).
- Not recorded anywhere: per-stage history, fix-round history, human stops (they are chat or AskUserQuestion only), a PR checklist.

## Part A: pipeline writes a progress log (kit change, decided)
- `tasks/progress/<KEY>.jsonl`, one JSON line per event: `{"at","stage","event","round","note"}`. `stage` ∈ plan, tests, code, check, review, ship. `event` ∈ start, done, fail, wait, resume. `round` = fix round (1 = first try).
- Who writes: `/build` (plan done after approval), build-coordinator (each stage start/done/fail, each fix round, every stop as `wait` with the reason in `note`), `/ship` (ship start/done with the PR URL in `note`, or `wait` on the warnings question).
- Append-only, never rewritten; written next to the receipt with the same tool the coordinator already uses for the receipt. It is a log, not a gate: /ship keeps gating on the receipt only.
- Bump dev-day AND tdd-pipeline to the same version (validate.sh §5 fails otherwise), even if one has no change.

## Part B: the card (side-panel mod)
- Source order: progress log if present, else receipt + `$.agent.list()` types (so a run from an older pipeline still shows something).
- Stages: one row, Plan · Tests · Code · Check · Review · Ship, each done / running / waiting / failed, with "r2", "r3" badges from the log's round. "N of 6 stages · %", "Iteration k · S stage runs" (S = start events).
- NOW: running stage + a fixed one-line description per stage (e.g. Check = "Runs the test command"). A `wait` event turns it into an approval card showing the reason, then "Resumed" on the next `resume`/`start`. Display only: the answer still happens in chat.
- Readiness rows: "Ready for a pull request" = Ship band's `receipt.ts` all clear (import it, do not re-implement).
- PR row: waiting → "PR ready" + link from the ship `done` note, then a checklist built from the plan's Success Criteria lines (each with its Prover), shown unchecked for manual review.
- Hidden when the session repo has no plan/progress file for an unshipped key.

## Do
1. PROBE: `$.fs` read + list in cwd; `$.agent.list()` `type` for a real pipeline agent. Record shapes in the PR body; drop what is absent and say so.
2. Part A edits + a kit test that the coordinator text names every event it must write (validate.sh style), then Part B.
3. Pure logic (`progress.ts`: log lines → stage states, rounds, now, wait) with unit tests: clean run, 2 fix rounds, blocked review, wait → resume, malformed line skipped (never throw), no log (fallback path).
4. Render: terminal text chips + `━` bar from `segments`; desktop Svg only for shapes, every word in `Text`.
5. Bump side-panel version; README paragraph.

## Do NOT
- No personal paths, names, hosts in shipped files (public kit).
- No second poller, no new pane, no buttons that answer the pipeline, no writes to receipts.
- Do not copy the reel's code or art (none is public; build from the description).

## Hard questions (to the owner after the probe)
- Six stages in one row, or the reel's 2-D grid (rows Tests / Code / Review × columns Start / Run / Fix / Pass)?
- Keep the last finished run on the card until the next `/build`, or hide it once shipped?

## Done means
- Kit: tsc clean, `claude plugin validate` + `claude plugin test mods/side-panel` pass (summary line pasted), `bash tests/validate.sh` passes.
- Mutation check on `progress.ts`: break each rule once; suite red each time.
- One real `/build` on a tiny ticket in a scratch repo: the progress log has every stage, and the owner screenshots the card mid-run and after ship. Until then the PR marks it unverified.
- No AI attribution in commits or the PR body (hard rule).

> Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output)
> vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.
