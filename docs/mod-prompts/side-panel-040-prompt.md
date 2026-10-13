Build side-panel 0.4.0: a fuller header row, the cache-keeper band moved in as a Cache card at the top of the pane, and look B (pipeline rail + helper tree) for the Agents card. Local build, no Jira (mods are not ticketed). Source repo: /Users/shashankreddyganta/projects/claude-tdd-kit (public), mods at mods/side-panel and mods/cache-keeper. Work in a worktree: `git worktree add ../claude-tdd-kit-panel-040 -b feat/side-panel-040 origin/main`; open a PR to main, the owner merges. Commit this prompt file with the PR.

Read first: tasks/plans/panel-040-mocks.html (the approved layout, terminal + desktop), tasks/plans/agents-card-mocks.html (look B section), mods/side-panel/hooks/{register.tsx,agents.ts,look.ts,receipt.ts} and tests, mods/cache-keeper/hooks/{register.tsx,cache.ts} and tests, both mods' types/index.d.ts, the API types at mods/side-panel/.claude-plugin/types/claude-code/index.d.ts (grep, ~16k lines), tdd-pipeline/agents/build-coordinator.md (stages), docs/mod-prompts/workflow-card-prompt.md. Load the `plugin-authoring` skill before writing hooks.

## Why
- The cache band takes two rows above the prompt in every session. The owner wants that space back when the side panel is docked, with everything the band shows moved to the top of the panel.
- The status line shows model, folder and branch; the panel header shows only the folder. The owner wants model, branch and a timer there too.
- The Agents card lists agents flat. Look B (picked 2026-10-12) shows a TDD build as stages plus a tree of who spawned whom.

## What already exists (reuse, do not rebuild)
- Header row: mods/side-panel/hooks/register.tsx ~294-297 draws `<project> [live]`; the `project` atom (~32, set in `refresh()` ~76-84). Extend it, do not add a second header.
- Branch: `readHead(repo)` in mods/side-panel/hooks/receipt.ts ~69 (reads `.git`, worktree `gitdir:` file, packed-refs; no shell), wired as `repoOf($)` ~93. Call it; add a worktree flag to its return by a parameter or field, do not write a second `.git` reader.
- Model: `$.session.model()`. Folder: `$.session.cwd()`. Timer: `SessionUsage.startedAt` from `$.session.usage()` with `$.clock.now()`.
- Cache band: mods/cache-keeper/hooks/register.tsx (159 lines) renders it on `ui.render` `AbovePrompt` (~108-157); pure helpers in cache.ts (`filled`, `eatingText`, `limitsText`, state tone). Atoms `lastAt`, `model`, `ttlMin`, `tick`, `warnedFor`, `eating`, `hidden`; `$.store` key `rates` ($/token per base model, learned from `classic.SessionStart` / `classic.PostModelSwitch`); 15s clock tick + one-time cold warning toast; `/cachekeeper on|off|ttl`; buttons end (e) / clear (c) / start (s).
- Agents card: `refreshAgents` (~101-109, 3s `$.clock.every` poll of `$.agent.list()`), `agentBoard()` in agents.ts, per-agent tokens from the `turn.step` hook (~163-168). `AgentInfo.parentId` exists in the API and is not read today.
- Pane docking: `$.ui.open({ id: 'side-panel' })` on session.start; `Pane.placement` is `'dock' | 'inline'`; `$.ui.panes()` lists this plugin's own panes.
- Ship band also wraps AbovePrompt (register.tsx ~177-196); keep it working.

## Probe results (2026-10-12, these win over the typings)
- `agent.spawn` events carry `parentAgentId`; `$.agent.list()` rows carry `parentId`. A 3s poll misses short agents, so build the tree from the spawn hook.
- Not yet probed: the live `AgentInfo.type` string for a kit agent (typings say `<plugin>:<name>`, e.g. `tdd-pipeline:test-writer`); whether build-coordinator -> test-writer shows as a parent link; background agents.

## Decided with the user (do not relitigate)
- **Stage view:** look B's rail is drawn in 0.4.0 from agent types. When the Workflow card's progress log (`tasks/progress/<KEY>.jsonl`, workflow-card-prompt.md Part A) exists later, it becomes the rail's source. One stage view, inside the Agents card; update workflow-card-prompt.md and BUILD-ORDER.md to say so.
- **Cache card:** merge cache-keeper into side-panel. One cache component, drawn as the Cache card at the top of the pane when the pane is docked, and as today's band above the prompt when it is not. No second copy of the layout. cache-keeper is retired: its `/cachekeeper` command, TTL setting, rates learning, warning toast and buttons move into side-panel.
- **Header:** as mocked. Terminal: `<project> [live]  <model> · <timer>` on row 1, `⎇ <branch> ⑂ wt` on row 2; desktop: one row. No context meter in the header; context stays in the Cache card.
- **Agent rows keep the model** (and effort when known), as the 0.2.x cards do today via `metaLine`: in the terminal on a dim line under the agent (shared with "now <tool>" for helpers), on desktop inline after the name. Reuse `metaLine`; do not write a second formatter.
- **Timer:** session start from the engine (resets on /clear, counts from first launch on resume).
- Left out on purpose: today/MTD $, rtk savings (they come from the owner's private status-line caches; the kit is public). The status line stays as is.
- Version: side-panel 0.4.0.
- Owner rulings after the 2026-10-13 probe (the four hard questions):
  1. Stage map keyed on the full `tdd-pipeline:<name>` type (the live `type` names the agent exactly); a build's agents are found through the `parentAgentId` chain up to its build-coordinator, so reviewers (grandchildren) count.
  2. Round badge: yes. Count test-runner spawns under the same build-coordinator ("run r2"); r2 and up proven by unit test.
  3. Two builds at once: the rail for the newest build-coordinator, a plain parent tree for the rest.
  4. cache-keeper migration: a README migration line. Load both mods with `--plugin-dir` and check the double band and the `/cachekeeper` clash; add a one-time toast only if the clash is harmful.

## Do
1. **PROBE FIRST** with a throwaway hot-reload mod and real subagents: the live `type` of a kit agent and of Explore/general-purpose, `agent.spawn` `parentAgentId` for build-coordinator's children, how `Pane.placement` reports docked vs inline and when it changes (resize, fullscreen toggle), and whether `/clear` resets `startedAt`. Write the real shapes in the PR body.
2. Header: extend the existing row per the mock; add the worktree flag to `readHead`'s result.
3. Move cache-keeper's hooks, helpers and tests into side-panel (split files by job; register.tsx is already 332 lines, keep each file under ~400). One render function for the cache view; the pane calls it as a card, the AbovePrompt hook calls it as a band only while the pane is not docked.
4. Retire cache-keeper: remove mods/cache-keeper, its marketplace entry, and its README section; add a migration line in the README (uninstall cache-keeper, side-panel 0.4.0 carries it). Grep for every reference first.
5. Look B: stage map is a fixed list of kit agent names (Explore/planner = explore, test-writer = tests, implementer = code, test-runner = run, code-review-coordinator + reviewers = review); pin it with a test. Rail draws only when a kit pipeline agent is live; else a plain parent tree. Helper rows show the current tool ("now Edit ...") as in the mock.
6. Tests for every new pure function (stage map, tree build, header text, docked switch) plus one render test per state in the mock page (docked full pane, not docked, no build running).

## Do NOT
- Do not copy the band layout into a second component, and do not write a second `.git` reader.
- Do not read anything outside the repo or the engine APIs (no status-line cache files).
- Do not draw emoji in the terminal (they garbled the header before); desktop may keep them.
- Do not change the pipeline (no progress log in this build).
- Do not bump dev-day or tdd-pipeline.

## Hard questions (put to the owner after the probe, not before)
- If a kit agent's live `type` does not name the agent, what drives the stage map?
- Fix-loop rounds (test-runner <-> implementer, up to 5): show a round badge on the rail ("run r2") or leave rounds to the Workflow card?
- Two builds running at once: two rails, or one rail for the newest?
- Users who installed only cache-keeper (not side-panel): is a README migration line enough?

## Done means
- tsc clean (`npx -p typescript tsc -p mods/side-panel`), `claude plugin validate mods/side-panel` passes, `claude plugin test mods/side-panel` all pass, with the pass/fail summary line pasted.
- Mutation check: break each new pure function and one render branch; the suite goes red each time.
- `bash tests/validate.sh` passes.
- The probe's real field shapes are in the PR body.
- The owner screenshots, in a new terminal tab with the installed side-panel and cache-keeper disabled (`claude --plugin-dir <worktree>/mods/side-panel --settings '{"enabledPlugins":{"side-panel@claude-tdd-kit":false,"cache-keeper@claude-tdd-kit":false}}'`): the docked pane in fullscreen during a real `/build` (header, Cache card, rail), and a narrow window (band above the prompt). The PR states which parts are unverified until then.
- No AI attribution in commits or the PR body (hard rule).

> Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output)
> vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.
