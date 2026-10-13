import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, AgentSpawnResult, EngineInterface, Register, RenderChildren, SessionUsage } from 'claude-code'

import type { JiraState, Section, ShipItem, Undone } from '../types'
import { MAIN, addStep, agentBoard, baseModel, modelText, nowText, seen } from './agents'
import { agentsView } from './agents-view'
import { cacheState, cacheStats, eatingText } from './cache'
import type { CacheView } from './cache-view'
import { cacheView } from './cache-view'
import { chip, line } from './look'
import type { HeadInfo, Repo } from './receipt'
import { READY, readHead, shipState } from './receipt'
import { docksPane, headerText, isProjectSearch, issuesOf, jiraKeyOf, jiraSection, needsSection, savedPathOf, todoSection, topicOf } from './panel'
import { KEYS, addUndone, doItNow, fileTodos } from './undone'

// Right-side dock (fullscreen terminal, wide enough): a read-only dashboard of what needs the owner,
// scoped to the OPEN project only (owner ruled 2026-10-07): its Jira key, its todos, this session's agents.
// The one action is "Left undone": a key per entry fills the prompt box (owner ruled 2026-10-07).
const PANE = 'side-panel'
const REFRESH_MS = 60_000
const AGENTS_MS = 3_000
// Cache (moved in from cache-keeper 0.2.0). Assumes a 60-minute prompt-cache TTL; set yours with `/cachekeeper ttl`.
const DEFAULT_TTL_MIN = 60
const TICK_MS = 15_000
const sections = atom({ plugin: 'side-panel', key: 'sections' } as const, [])
const agents = atom({ plugin: 'side-panel', key: 'agents' } as const, [])
// Every agent.spawn this session (the 3s poll misses short agents), and the tool each agent last called.
const spawns = atom({ plugin: 'side-panel', key: 'spawns' } as const, {})
const doing = atom({ plugin: 'side-panel', key: 'doing' } as const, {})
// Tokens per loop from every turn.step ('' = main); the poller turns them into each agent's share.
const usage = atom({ plugin: 'side-panel', key: 'usage' } as const, {})
const undone = atom({ plugin: 'side-panel', key: 'undone' } as const, [])
const topic = atom({ plugin: 'side-panel', key: 'topic' } as const, '')
const project = atom({ plugin: 'side-panel', key: 'project' } as const, '')
const head = atom({ plugin: 'side-panel', key: 'head' } as const, { worktree: false })
// Caught from start-session's own Jira search (no URL or login of ours); refreshed by any later project-wide search.
const jira = atom({ plugin: 'side-panel', key: 'jira' } as const, 'waiting' as JiraState)
// Ship band: what /ship would refuse right now, from the repo's pipeline receipt (null = no receipt).
const ship = atom({ plugin: 'side-panel', key: 'ship' } as const, null)
const lastAt = atom({ plugin: 'side-panel', key: 'lastAt' } as const, null)
const lastModel = atom({ plugin: 'side-panel', key: 'lastModel' } as const, null)
const ttlMin = atom({ plugin: 'side-panel', key: 'ttlMin' } as const, DEFAULT_TTL_MIN)
const tick = atom({ plugin: 'side-panel', key: 'tick' } as const, 0)
const warnedFor = atom({ plugin: 'side-panel', key: 'warnedFor' } as const, null)
const eating = atom({ plugin: 'side-panel', key: 'eating' } as const, '')
// `/cachekeeper off` hides the cache (card and band) for this session; `/cachekeeper on` shows it again.
const hidden = atom({ plugin: 'side-panel', key: 'hidden' } as const, false)
const SHIP_TOOLS = new Set(['Write', 'Edit', 'Bash'])
const SHIP_LOOK: Record<ShipItem['level'], [string, string]> = { ok: ['✓ ', 'success'], warn: ['⚠ ', 'warning'], stop: ['✗ ', 'error'], muted: ['', 'subtle'] }
// A tile's count is dim when its source is off, error-colored when undone items wait, the accent otherwise.
const needsAction = (s: Section) => s.title === 'Left undone' && s.count > 0
function tileColor(s: Section) {
  if (s.note) return undefined
  return needsAction(s) ? 'error' : 'claude'
}
const ICON: Record<string, string> = { 'Needs you': '🔔', Jira: '🎫', Todos: '📝', 'Left undone': '⚠️' }

async function noteUndone($: EngineInterface, texts: string[]) {
  if (texts.length) await update($, undone, list => addUndone(list, texts))
}

async function doNow($: EngineInterface, u: Undone) {
  await update($, undone, list => list.filter(x => x.text !== u.text))
  await $.prompt.fill({ text: doItNow(u) })
}

async function getJson($: EngineInterface, url: string) {
  try {
    const r = await $.http.fetch(url)
    return r.ok ? JSON.parse(r.text) : null
  } catch {
    return null
  }
}

type Urls = { needs: string; todos: string }

async function projectKey($: EngineInterface) {
  return jiraKeyOf(await $.fs.read(`${await $.session.cwd()}/CLAUDE.md`).catch(() => ''))
}

// A source with no URL set is left out entirely (its tile and card hidden). Jira needs no URL; a repo with no
// Jira line gets no Jira tile.
async function refresh($: EngineInterface, urls: Urls) {
  const cwd = await $.session.cwd()
  const name = cwd.split('/').pop() ?? cwd
  const [cards, todos, key, tickets] = await Promise.all([
    urls.needs ? getJson($, urls.needs) : null,
    urls.todos ? getJson($, urls.todos) : null,
    projectKey($),
    read($, jira),
  ])
  await update($, project, () => name)
  void refreshRepo($)
  await update($, sections, () => [
    ...(urls.needs ? [needsSection(cards, key)] : []),
    ...(key ? [jiraSection(tickets, key)] : []),
    ...(urls.todos ? [todoSection(todos, name)] : []),
  ])
}

// The cache buttons' runner: one command each.
const runner = ($: EngineInterface) => (command: string) => void $.command.run({ command })

const repoOf = ($: EngineInterface): Repo => ({ read: p => $.fs.read(p), run: argv => $.process.run(argv) })

// The header's branch and the Ship band's receipt, from one read of HEAD. Never rejects: callers fire and forget.
async function refreshRepo($: EngineInterface) {
  const repo = repoOf($)
  const at = await readHead(repo).catch((): HeadInfo => ({ worktree: false }))
  const h = { ...(at.branch ? { branch: at.branch } : {}), worktree: at.worktree }
  if (JSON.stringify(h) !== JSON.stringify(await read($, head))) await update($, head, () => h).catch(() => undefined)
  const next = await shipState(repo, at).catch(() => null)
  if (JSON.stringify(next) !== JSON.stringify(await read($, ship))) await update($, ship, () => next).catch(() => undefined)
}

async function refreshAgents($: EngineInterface) {
  const list = await $.agent.list()
  const now = await $.clock.now()
  const all = seen(await read($, spawns), list, now)
  await update($, spawns, () => all)
  const session = await $.session.usage()
  const next = agentBoard(all, list, await read($, usage), await read($, doing), session.cost?.usd ?? 0, now)
  if (JSON.stringify(next) !== JSON.stringify(await read($, agents))) await update($, agents, () => next)
}

async function noteSpawn($: EngineInterface, e: AgentSpawnInput, r: AgentSpawnResult) {
  const id = r.agentId
  if (!id) return
  const s = { id, type: e.subagentType, description: e.description, model: r.model, from: await $.clock.now(), ...(e.parentAgentId ? { parent: e.parentAgentId } : {}) }
  await update($, spawns, all => ({ ...all, [id]: s }))
  await refreshAgents($)
}

// Local estimate only (`summary` sends no requests); refreshed once per main-loop turn, not per draw.
async function measureEating($: EngineInterface) {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  if (context.breakdown) await update($, eating, () => eatingText(context.breakdown!.categories))
}

async function rates($: EngineInterface) {
  return ((await $.store.get('rates')) ?? {}) as Record<string, number>
}

// The runtime prices a cache rewrite only on a resume and a model switch: keep its $/token per model.
// ponytail: one $/token per model, learned at whatever context size the runtime priced; long-context tiers blur.
async function learnRate($: EngineInterface, m: string | undefined, usd: number | undefined, tokens: number | undefined) {
  if (!m || !usd || !tokens) return
  await $.store.set('rates', { ...(await rates($)), [baseModel(m)]: usd / tokens })
}

async function onTick($: EngineInterface) {
  const now = await $.clock.now()
  await update($, tick, () => now)
  const last = await read($, lastAt)
  const s = cacheState(last, now, (await read($, ttlMin)) * 60_000, await read($, warnedFor))
  if (s?.shouldWarn) {
    await update($, warnedFor, () => last)
    $.ui.toast(`Cache goes cold in ${Math.ceil(s.msLeft / 60_000)}m. end / clear / start: the side panel's Cache card, or ctrl+x tab then e / c / s`, { timeoutMs: 15_000 })
  }
}

// What the cache view draws, or null while `/cachekeeper off` hides it. Reads the tick, so it redraws every 15s.
async function cacheData($: EngineInterface, u: SessionUsage): Promise<CacheView | null> {
  if (await read($, hidden)) return null
  await read($, tick)
  const state = cacheState(await read($, lastAt), await $.clock.now(), (await read($, ttlMin)) * 60_000, null)
  const m = await read($, lastModel)
  const rate = m ? (await rates($))[baseModel(m)] : undefined
  return { state, stats: cacheStats(u.context.tokens ?? 0, rate, u.rateLimits, u.cost?.usd), eating: await read($, eating) }
}

export const register: Register = (on, options) => {
  const urls: Urls = { needs: String(options.needs_url ?? ''), todos: String(options.todos_url ?? '') }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sidepanel', description: 'Side panel: open it if closed, close it if open (this session)' })
    // A cache-keeper still installed may hold the name first; it would stop this whole start (seen live 2026-10-13).
    await $.command
      .register({ name: 'cachekeeper', description: 'Side panel cache: hide/show it for this session, or set the cache TTL', argumentHint: 'on | off | ttl <minutes>' })
      .catch(() => $.ui.toast('cache-keeper is still installed: side-panel 0.4.0 carries the cache now. Run /plugin uninstall cache-keeper@claude-tdd-kit', { timeoutMs: 15_000 }))
    void $.ui.open({ id: PANE, title: 'Dashboard' })
    void refresh($, urls)
    $.clock.every(REFRESH_MS, () => void refresh($, urls))
    $.clock.every(AGENTS_MS, () => void refreshAgents($).catch(() => undefined))
    $.clock.every(TICK_MS, () => void onTick($))
    await onTick($)
    return next(e)
  })

  on('command.run', { command: 'sidepanel' }, async $ => {
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (isOpen) await $.ui.close({ id: PANE })
    else await $.ui.open({ id: PANE, title: 'Dashboard' })
    return { text: `Side panel ${isOpen ? 'closed' : 'opened'}` }
  })

  on('command.run', { command: 'cachekeeper' }, async ($, e) => {
    const [word, value] = e.args.trim().split(/\s+/)
    if (word === 'on' || word === 'off') {
      await update($, hidden, () => word === 'off')
      return { text: `Cache ${word} for this session` }
    }
    const minutes = Number(value ?? DEFAULT_TTL_MIN)
    if (word !== 'ttl' || !(minutes > 0)) return { text: 'Usage: /cachekeeper on | off | ttl <minutes> (no number resets to 60)' }
    await update($, ttlMin, () => minutes)
    await onTick($)
    return { text: `Cache TTL set to ${minutes}m` }
  })

  on('prompt.submit', async ($, e, next) => {
    // A subagent's hand-back arrives as a `peer` prompt (seen live 2026-10-13); it is not the owner's topic.
    const t = e.origin.kind === 'peer' ? '' : topicOf(e.text)
    if (t) void update($, topic, () => t).catch(() => undefined)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    await noteSpawn($, e, r).catch(() => undefined)
    return r
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const before = await $.fs.read(e.file_path).catch(() => '')
    const ran = await next(e)
    await noteUndone($, fileTodos(e.file_path, e.content, before)).catch(() => undefined)
    return ran
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    await noteUndone($, fileTodos(e.file_path, e.new_string, e.old_string)).catch(() => undefined)
    return ran
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id) void update($, doing, d => ({ ...d, [id]: nowText(e.tool, e as unknown as Record<string, unknown>) })).catch(() => undefined)
    const ran = await next(e)
    if (SHIP_TOOLS.has(e.tool)) void refreshRepo($)
    if (!e.tool.endsWith('searchJiraIssuesUsingJql') || 'deny' in ran) return ran
    const key = await projectKey($).catch(() => undefined)
    if (key && isProjectSearch(String((e as { jql?: unknown }).jql ?? ''), key)) {
      const saved = savedPathOf(ran.text)
      const text = saved ? await $.fs.read(saved).catch(() => undefined) : ran.text
      await update($, jira, () => (ran.isError ? 'unavailable' : issuesOf(text))).catch(() => undefined)
      void refresh($, urls)
    }
    return ran
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const effort = e.effort === undefined ? '' : String(e.effort)
    await update($, usage, u => addStep(u, e.agentId ?? MAIN, e.model, effort, r?.usage)).catch(() => undefined)
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    const id = e.agentId
    // A subagent's end stamps its span: a short one can leave list() before the 3s poll sees it.
    if (id !== undefined) {
      await update($, spawns, all => (all[id] ? { ...all, [id]: { ...all[id]!, to: now } } : all)).catch(() => undefined)
      return next(e)
    }
    void refresh($, urls)
    if (e.usage) {
      await update($, lastAt, () => now)
      await update($, lastModel, () => e.usage!.model)
      await onTick($)
    }
    void measureEating($).catch(() => undefined)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, lastAt, () => null)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    await learnRate($, e.model, e.estimated_cache_write_usd, e.context_tokens)
    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    await learnRate($, e.to_model, e.estimated_cache_write_usd, e.context_tokens)
    return next(e)
  })

  // Above the prompt: the Ship row, then the cache band while the pane is not docked (docked, the pane's Cache
  // card carries it), then whatever the plugins beneath draw (Next Steps). Ship is text only on every surface.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const s = await read($, ship)
    // A render may not write state (host check, seen 2026-10-13), so the pane cannot hand the band its placement:
    // the band reads the engine's dock rule off its own viewport instead.
    // Placed and the shown tab: a pane still waiting for room, or behind another tab, leaves the band up.
    const isDocked = docksPane(e.viewport) && (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced && p.isShown)
    const cache = isDocked ? null : await cacheData($, await $.session.usage())
    const showShip = s && !e.props.isWorking
    if (!showShip && !cache) return below
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    return (
      <Box flexDirection="column">
        {showShip ? (
          <Box key="ship" flexWrap="wrap" columnGap={1}>
            <Text bold>{s.items[0]?.text === READY ? s.key : `${s.key} ship ·`}</Text>
            {s.items.map(({ level, text }, i) => (
              <Text key={`ship${i}`} color={SHIP_LOOK[level][1]} dimColor={level === 'muted'}>{`${i ? '· ' : ''}${SHIP_LOOK[level][0]}${text}`}</Text>
            ))}
          </Box>
        ) : null}
        {cache ? cacheView(ui, e.surface, cache, runner($), true) : null}
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const list = await read($, sections)
    const open = await read($, undone)
    const now = await read($, topic)
    const name = await read($, project)
    const at = await read($, head)
    await read($, tick)
    const u = await $.session.usage()
    const cache = e.props.placement === 'dock' ? await cacheData($, u) : null
    const words = headerText(modelText(await $.session.model()), at.branch, at.worktree, (await $.clock.now()) - u.startedAt, e.surface !== 'terminal')
    const team = agentsView(ui, e.surface, await read($, agents))
    const tileWidth = Math.max(10, Math.floor((e.props.bodyColumns - 1) / 2))
    const isStale = list.some(s => s.note)
    // The terminal draws emoji at a different width than the layout counts, so they overwrite the next letters.
    const icon = (glyph = '') => (e.surface === 'terminal' ? '' : `${glyph} `)
    const card = (title: string, body: RenderChildren, key = title, sub = '') => (
      <Box key={key} flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
        <Box columnGap={2}>
          <Text bold>{title}</Text>
          {sub ? line(ui, sub, 'sub', true) : null}
        </Box>
        {body}
      </Box>
    )
    return (
      <Box flexDirection="column">
        <Box columnGap={1}>
          <Text bold>{`${icon('📊')}${name || 'Dashboard'}`}</Text>
          {chip(ui, isStale ? 'partial' : 'live', isStale ? 'warning' : 'success')}
          {line(ui, words[0] ?? '', 'meta', true)}
        </Box>
        {words[1] ? line(ui, words[1], 'branch', true) : null}
        {cache ? card('Cache', cacheView(ui, e.surface, cache, runner($), false)) : null}
        <Box flexWrap="wrap" columnGap={1}>
          {[...list, ...(open.length ? [{ title: 'Left undone', count: open.length, rows: [] }] : [])].map(s => (
            <Box key={`tile-${s.title}`} width={tileWidth} flexDirection="column" borderStyle="round" borderColor={needsAction(s) ? 'error' : 'subtle'} paddingX={1}>
              <Text bold color={tileColor(s)} dimColor={!!s.note}>
                {`${icon(ICON[s.title])}${s.note ? '–' : s.count}`}
              </Text>
              {line(ui, s.note ? `${s.title} · ${s.note}` : s.title, 'label', true)}
            </Box>
          ))}
        </Box>
        {card(`${icon('🤖')}Agents`, team.body, 'Agents', team.title)}
        {card(`${icon('💬')}Now`, line(ui, now || 'nothing yet', 'now', !now), 'Now')}
        {open.length > 0 && (
          <Box flexDirection="column" borderStyle="round" borderColor="error" paddingX={1}>
            <Box>
              <Box flexGrow={1}>
                <Text bold color="error">{`${icon('⚠️')}Left undone ${open.length}`}</Text>
              </Box>
              <Button plain dimColor key="clear" label="clear all" hotkey="x" onPress={() => update($, undone, () => [])} />
            </Box>
            {open.map((u, i) => (
              <Box key={`undone${i}`}>
                <Button plain key={`do${i}`} label={u.text} hotkey={KEYS[i]} onPress={() => doNow($, u)} />
              </Box>
            ))}
            <Text dimColor wrap="truncate-end">click an entry: "Do it now" lands in your prompt box</Text>
          </Box>
        )}
        {list
          .filter(s => s.rows.length)
          .map(s => card(`${icon(ICON[s.title])}${s.title}`, s.rows.map((row, i) => line(ui, row, `${s.title}${i}`)), s.title))}
      </Box>
    )
  })
}
