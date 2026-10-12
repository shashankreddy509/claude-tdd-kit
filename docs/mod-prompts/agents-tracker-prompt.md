Build the Agents tracker in the side-panel mod: a per-agent card list with cost, tokens, time, step progress and a pixel avatar. Local build, no Jira (mods are not ticketed). Source repo: this repo (public), mod at mods/side-panel. Branch off main as feat/agents-tracker; open a PR, the owner merges.

Read first: mods/side-panel/hooks/{register.tsx,panel.ts,look.ts} and their tests, mods/side-panel/types/index.d.ts, the API types at mods/side-panel/.claude-plugin/types/claude-code/index.d.ts (grep, ~15k lines), and a reference frame kept outside the repo (a public video's "Agents" panel). Load the `plugin-authoring` skill before writing hooks.

## Why
Goal: the side panel's Agents card should to look and inform like the video's Agents panel: header tiles (Cost / Tokens / Time) and, per running agent, a card with an avatar, title, model · effort, "n/N · <current step>" with a colored bar, "ctx % · tokens ≈$cost elapsed", and a status dot. Today the card is one row per agent (label, status chip, elapsed).

## What already exists (reuse, do not rebuild)
- `refreshAgents` (register.tsx ~74-81): polls `$.agent.list()` every 3 s, first-seen times in `seen`, writes the `agents` atom only on change. Extend it, do not add a second poller.
- `agentBoard` (panel.ts ~87-93) builds `{counts, rows}`; rows drop completed agents. Extend the `Agent` row type (types/index.d.ts) with new fields by parameter (usage map keyed by agent id).
- `clock()` (panel.ts) formats elapsed "0:52".
- look.ts: `segments()` (terminal cell bar), `barSvg(counts)` (stretchy bar, preserveAspectRatio none), `dotSvg(working)` (10 px pulsing dot), light + dark palette. A single progress bar is `barSvg`/`segments` fed a fraction; extend, do not copy.
- register.tsx Agents card (~167-197): surface switch `const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined`. Keep that rule (the terminal's element table also lists Svg).
- Mount-test pattern in look.test.ts: `mock.clock(on)`, stub `agent.list` / `session.start` (return `{ cwd }`) / `command.register` / `ui.open` / `session.cwd` / `fs.read`, then `$.session.start(...)` and `clock.advance(3_100)`.
- Avatar source: the owner's private sprite generator (`spritegen.py`): `traits(name)` hashes a name to skin / hair / shirt / trousers / hairstyle; sprites are 18x32 pixel dicts. Port the trait + pixel logic to TS that returns an SVG string of `<rect>`s; nothing from any third-party tileset.

## Probe results (2026-10-09, these win where the text below disagrees)
- `turn.step` streams: its hook is `async function* ($, e, next) { const r = yield* next(e) }`, not `await next(e)`. Live it gave `e.agentId` (absent on main), `e.model` (`claude-opus-5-5[1m]`, `claude-haiku-5-5`), `e.effort` (`high`, `medium`) and `r.usage` {input, output, cache read, cache creation}.
- `agent.spawn` result `{ model, agentId }`; `turn.complete` carries `agentId` + summed usage; `session.usage()` gives `cost.usd` (includes subagent spend) and `context.window`.
- Built-in subagents (Explore, general-purpose) have NO todo tool: zero TodoWrite/TaskCreate calls. The step bar is OUT of v1.
- ctx % shows only when the agent runs the session's model; a Haiku agent's window is not the session's 1M.
- Time tile = since the first agent started; finished agents fold into "Finished · N".

## Decided (do not relitigate)
- Planned agents ("Planned · after 1, 2, 3") are OUT of v1.
- Step progress = the agent's own todos: watch `tool.call` for TodoWrite / TaskCreate / TaskUpdate carrying `e.agentId`; n/N = completed/total, label = the in-progress item's activeForm (or content). An agent with no todos shows no step bar. Do NOT inject a progress tool or rewrite agent prompts.
- Cost = share of session $: `$.session.usage().cost.usd` × (this agent's tokens / all tokens counted), shown with "≈". No price table. (cache-keeper's learned rate is a cache-write price and is private to that plugin: do not use it.)
- Effort = the real words Claude Code reports (`turn.step` input `effort`: low / medium / high / xhigh / max), next to the model. Do not invent names like careful / heavy.
- Avatars: port the private sprite generator's trait + pixel logic to the public kit. Desktop draws a small FIXED-size pixel person per agent, seeded by its description/type; terminal shows an emoji instead.
- Desktop may look richer than the terminal.
- No third-party art or code (public kit): the video's public repos are reference images only, never copied.

## Do
1. PROBE FIRST, before building UI: a throwaway hook logging (via `$.ui.toast` or a dev line) what `turn.step` (await `next(e)`, read `result.usage`, `e.model`, `e.effort`, `e.agentId`), `turn.complete` (`e.agentId`, `e.usage`), `agent.spawn` (result `{model, agentId}`) and `tool.call` TodoWrite with `e.agentId` actually deliver when ONE real Explore subagent runs. The doc comments say subagents carry `agentId` + usage; nothing has been observed live. Record the real shapes in the PR body. If a field is absent live, drop that part and say so.
2. Collect per-agent usage: model + effort + tokens (input + output + cache read + cache creation) + last-step input-side tokens for ctx %, in a new `$.state` value declared in types/index.d.ts. ctx % = last step's input-side tokens / `$.session.usage().context.window` (state the assumption that the agent runs a model with the session's window).
3. Collect per-agent todos (n/N + current label) from the todo tools.
4. Header tiles: Cost (≈ session $ attributed to agents), Tokens (sum over agents), Time (see Hard questions).
5. Card per running agent. Desktop: Svg ONLY for shapes (avatar at fixed width/height props, progress bar stretchy with `height` prop, status dot); every word stays `Text`. The desktop STRETCHES an Svg to its slot (2026-10-09: a 320 px SVG with text grew ~1.75x), so text inside Svg is forbidden. Terminal: same rows as text, colored chips, `━` bar from `segments`.
6. Pure logic (attribution, todo counting, avatar traits/SVG) in .ts files with unit tests; mount tests over ['terminal','desktop'] driving a live agent the way look.test.ts does.
7. Bump side-panel's version; update the side-panel paragraph in the kit README.

## Pipeline stage grid: moved out
The reel #10 stage grid is its own build now: docs/mod-prompts/workflow-card-prompt.md. Do not build it here.

## Do NOT
- Do not rewrite any agent's prompt or register a tool agents must call.
- Do not put text inside an Svg.
- Do not copy art, palettes or code from the video's repos or any tileset.
- Do not add personal paths, hosts or names to the kit (public): no home-directory paths, no personal names in shipped files.
- Do not add a second agent poller or a second dashboard pane.

## Hard questions (put to the owner after the probe, not before)
- Time tile: session time, or wall time since the first agent started?
- Keep finished agents in a collapsed "Finished · N" group (the video does), or drop them as today?
- Card height: the video's cards are 3-4 lines each; with 5+ agents the pane scrolls. Cap the list (e.g. 4 cards + "+N more") or let it scroll?
- Does the avatar generator ship inside side-panel only, or is it worth a shared file other mods could use later (only matters if another mod wants avatars)?

## Done means
- tsc clean (`npx -p typescript tsc -p mods/side-panel`), `claude plugin validate mods/side-panel` passes, `claude plugin test mods/side-panel` all pass, with the pass/fail summary line pasted.
- Mutation check: break each new pure function and one render branch; the suite goes red each time.
- `bash tests/validate.sh` passes.
- The probe's real field shapes are written in the PR body.
- The owner screenshots the pane in a LOCAL desktop session (laptop icon) and in iTerm with one Explore agent running; the PR states which parts are unverified until those screenshots.
- No AI attribution in commits or the PR body (hard rule).

> Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output)
> vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.
