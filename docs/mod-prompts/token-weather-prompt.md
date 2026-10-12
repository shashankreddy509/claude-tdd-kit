Build Token weather: turn Cache Keeper's rate-limit text into a forecast, e.g. `5h 62% ☁ full ~3:40pm, resets 4:10pm`. It EXTENDS the existing cache-keeper band; no second band. Local build, no Jira. Source repo: this repo (public), mod at mods/cache-keeper. Branch off main as feat/token-weather; open a PR, the owner merges.

Origin: reel #5 (a public reel), "token weather" forecast above the prompt. Overview: kept outside the repo (marked Partly: the band shows cache state, not a forecast).

Read first: mods/cache-keeper/hooks/register.tsx (`limitsText`, `LIMIT_NAMES`, the AbovePrompt hook that already reads `$.session.usage()` and prints `5h 42% · week 31%`), mods/cache-keeper/hooks/cache.ts + cache.test.ts, mods/cache-keeper/types/index.d.ts, and in the API types (mods/side-panel/.claude-plugin/types/claude-code/index.d.ts) grep `SessionRateLimit` (`kind`, `percentUsed`, `resetsAt?`), `'session.measure'` (pushed after each main turn and when a window moves a whole point, with `changed`) and `SessionUsage`. Load the `plugin-authoring` skill before writing hooks.

## What the API really gives (from the types, not yet seen live)
- Per window: `percentUsed` (0-100) and an optional `resetsAt` (ISO). Windows: `five_hour`, `seven_day`, a gateway's `spend_limit`. Empty off a subscription.
- No burn rate and no forecast: the mod must sample `percentUsed` over time itself.
- `cost.usd` is per session; it says nothing about the account window. Do not forecast from it.

## Decided
- cache-keeper owns all usage math. side-panel reads cost for agent shares and must not grow a forecast; nothing else may read rate limits.
- Sample on `session.measure` when `changed` includes `rateLimits` (no new timer; the band's existing tick only redraws). Keep the last ~12 samples per window in a cache-keeper atom.
- Pace = percent per minute over the samples since the window's last reset. ETA to 100% = now + (100 - used) / pace.
- Weather word per window: `☀` clear (ETA after `resetsAt` or no pace yet), `☁` tight (ETA within 30 min of the reset), `⛈` limit before reset (show the ETA). One word per window, same `| ` separators as today.
- A window with no `resetsAt` shows today's plain `5h 42%`.

## Do
1. PROBE first: log `session.measure` events and `$.session.usage().rateLimits` over a few turns. Does `resetsAt` arrive? Does `percentUsed` move in whole points only? Record real shapes in the PR body; drop what is absent.
2. Pure logic in `weather.ts` (`addSample`, `pace`, `forecast(window, samples, now) → {icon, text}`) with unit tests: no samples, flat usage, steep usage hitting 100 before reset, a reset mid-history (samples drop), missing `resetsAt`, `spend_limit` past 100.
3. Replace `limitsText` with the forecast text (delete the old function and its tests in the same change; no dead code).
4. Bump cache-keeper's version; update its README paragraph.

## Do NOT
- No second AbovePrompt band, no new poller, no price table.
- No personal paths, names or hosts in shipped files (public kit). No third-party code.

## Hard questions (to the owner after the probe)
- Thresholds: 30 min of margin for `☁`, or another number?
- Show the week window too, or only the 5h one until the week passes 50%?

## Done means
- tsc clean (`npx -p typescript tsc -p mods/cache-keeper`), `claude plugin validate mods/cache-keeper`, `claude plugin test mods/cache-keeper` pass, summary line pasted.
- Mutation check: break `pace`, the reset handling and each weather threshold once; the suite goes red each time.
- `bash tests/validate.sh` passes.
- Owner screenshot of the band after a busy hour, next to Next Steps; until then the PR marks it unverified.
- No AI attribution in commits or the PR body (hard rule).

> Before returning, state explicitly what you VERIFIED (a log line, a file read, a command output)
> vs what you INFERRED. Flag any conclusion resting on correlation rather than direct evidence.
