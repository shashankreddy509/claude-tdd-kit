import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Agent, JiraState, Section, Undone } from '../types'
import type { Span } from './agents'
import { CARDS, MAIN, WORKING, addStep, agentBoard, metaLine, statsLine, tokensText, track, usdText } from './agents'
import { avatarEmoji, avatarSvg } from './avatar'
import { BAR, PARTS, barSvg, dotSvg, segments } from './look'
import { isProjectSearch, issuesOf, jiraKeyOf, jiraSection, needsSection, savedPathOf, todoSection, topicOf } from './panel'
import { KEYS, addUndone, doItNow, fileTodos } from './undone'

// Right-side dock (fullscreen terminal, wide enough): a read-only dashboard of what needs the owner,
// scoped to the OPEN project only (owner ruled 2026-10-07): its Jira key, its todos, this session's agents.
// The one action is "Left undone": a key per entry fills the prompt box (owner ruled 2026-10-07).
const PANE = 'side-panel'
const REFRESH_MS = 60_000
const AGENTS_MS = 3_000
const sections = atom({ plugin: 'side-panel', key: 'sections' } as const, [])
const agents = atom({ plugin: 'side-panel', key: 'agents' } as const, {
  counts: { working: 0, waiting: 0, done: 0, stuck: 0 },
  totals: { usd: 0, tokens: 0, time: '0:00' },
  rows: [],
  finished: [],
})
// Tokens per loop from every turn.step ('' = main); the poller turns them into each agent's share.
const usage = atom({ plugin: 'side-panel', key: 'usage' } as const, {})
const showFinished = atom({ plugin: 'side-panel', key: 'showFinished' } as const, false)
const undone = atom({ plugin: 'side-panel', key: 'undone' } as const, [])
const topic = atom({ plugin: 'side-panel', key: 'topic' } as const, '')
const project = atom({ plugin: 'side-panel', key: 'project' } as const, '')
// Caught from start-session's own Jira search (no URL or login of ours); refreshed by any later project-wide search.
const jira = atom({ plugin: 'side-panel', key: 'jira' } as const, 'waiting' as JiraState)
// When this mod first and last saw each agent live (ms); resets on reload, so elapsed restarts then.
const spans: Record<string, Span> = {}
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
  await update($, sections, () => [
    ...(urls.needs ? [needsSection(cards, key)] : []),
    ...(key ? [jiraSection(tickets, key)] : []),
    ...(urls.todos ? [todoSection(todos, name)] : []),
  ])
}

async function refreshAgents($: EngineInterface) {
  const list = await $.agent.list()
  const now = await $.clock.now()
  track(spans, list, now)
  const session = await $.session.usage()
  const next = agentBoard(list, spans, await read($, usage), { usd: session.cost?.usd ?? 0, window: session.context.window })
  const prev = await read($, agents)
  if (JSON.stringify(next) !== JSON.stringify(prev)) await update($, agents, () => next)
}

export const register: Register = (on, options) => {
  const urls: Urls = { needs: String(options.needs_url ?? ''), todos: String(options.todos_url ?? '') }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sidepanel', description: 'Side panel: open it if closed, close it if open (this session)' })
    void $.ui.open({ id: PANE, title: 'Dashboard' })
    void refresh($, urls)
    $.clock.every(REFRESH_MS, () => void refresh($, urls))
    $.clock.every(AGENTS_MS, () => void refreshAgents($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'sidepanel' }, async $ => {
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (isOpen) await $.ui.close({ id: PANE })
    else await $.ui.open({ id: PANE, title: 'Dashboard' })
    return { text: `Side panel ${isOpen ? 'closed' : 'opened'}` }
  })

  on('prompt.submit', async ($, e, next) => {
    const t = topicOf(e.text)
    if (t) void update($, topic, () => t).catch(() => undefined)
    return next(e)
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
    const ran = await next(e)
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
    if (e.agentId === undefined) {
      void refresh($, urls)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const list = await read($, sections)
    const live = await read($, agents)
    const opened = await read($, showFinished)
    const open = await read($, undone)
    const now = await read($, topic)
    const name = await read($, project)
    const tileWidth = Math.max(10, Math.floor((e.props.bodyColumns - 1) / 2))
    const isStale = list.some(s => s.note)
    const { counts } = live
    const legend = PARTS.filter(([k]) => counts[k] || k !== 'stuck').map(([k]) => `${counts[k]} ${k}`).join(' · ')
    const line = (text: string, key: string, dim = false) => (
      <Text key={key} wrap="truncate-end" dimColor={dim}>
        {text}
      </Text>
    )
    const chip = (text: string, color: string) => (
      <Text backgroundColor={color} color="inverseText">{` ${text} `}</Text>
    )
    const card = (title: string, body: RenderChildren, key = title) => (
      <Box key={key} flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
        <Text bold>{title}</Text>
        {body}
      </Box>
    )
    // Remote surfaces (desktop, editor, phone) draw the count bar and each working agent's pulsing dot as SVG.
    // The terminal's table is padded with every element name, so `'Svg' in ui` alone is true there too: the
    // surface decides. Only shapes are SVG: the desktop scales an SVG to its slot, which would blow up text.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
    const barWidth = Math.max(4, e.props.bodyColumns - 4)
    const barCells = segments(PARTS.map(([k]) => counts[k]), barWidth)
    const bar = Svg ? (
      <Svg source={barSvg(counts)} alt={`Agents: ${legend}`} height={8} />
    ) : (
      <Text>
        {PARTS.map(([k, color], i) => (barCells[i] ? <Text key={k} color={color}>{BAR.repeat(barCells[i])}</Text> : null))}
        {barCells.some(Boolean) ? null : <Text color="subtle">{BAR.repeat(barWidth)}</Text>}
      </Text>
    )
    // Header tiles: Cost (≈ the agents' share of the session $), Tokens, Time since the first agent started.
    const third = Math.max(8, Math.floor((e.props.bodyColumns - 6) / 3))
    const { totals } = live
    const tiles = (
      <Box key="tiles" columnGap={1}>
        {([[usdText(totals.usd), 'Cost'], [tokensText(totals.tokens), 'Tokens'], [totals.time, 'Time']] as const).map(([value, title]) => (
          <Box key={title} width={third} flexDirection="column">
            <Text bold color="claude">{value}</Text>
            {line(title, 'label', true)}
          </Box>
        ))}
      </Box>
    )
    // One card per live agent: a fixed-size pixel person on remote surfaces (a face emoji in the terminal), and
    // every word as Text beside it.
    const agentCard = (a: Agent, i: number) => {
      const working = WORKING.has(a.status)
      const meta = metaLine(a)
      return (
        <Box key={`agent${i}`} columnGap={1}>
          {Svg ? <Svg source={avatarSvg(a.label)} alt={`${a.label} avatar`} width={27} height={48} /> : <Text>{avatarEmoji(a.label)}</Text>}
          <Box flexDirection="column" flexGrow={1}>
            <Box columnGap={1} alignItems="center">
              {Svg ? <Svg source={dotSvg(working)} alt={a.status} width={10} height={10} isInteractive={working || undefined} /> : null}
              <Box flexGrow={1}>{line(a.label, 'label')}</Box>
              {chip(a.status, working ? 'success' : 'warning')}
            </Box>
            {meta ? line(meta, 'meta', true) : null}
            {line(statsLine(a), 'stats', true)}
          </Box>
        </Box>
      )
    }
    // Finished agents fold into one line that opens to a row each.
    const finished = live.finished.length
      ? [
          <Button key="finished" plain dimColor label={`${opened ? '▾' : '▸'} Finished · ${live.finished.length}`} onPress={() => update($, showFinished, v => !v)} />,
          ...(opened ? live.finished.map((a, i) => line(`${a.label} · ${statsLine(a)}`, `done${i}`, true)) : []),
        ]
      : []
    // Idle (nothing ever ran or is running) is one line, not tiles, an empty bar and a row of zeros.
    const idle = !live.rows.length && !live.finished.length
    const more = live.rows.length - CARDS
    const agentBody = idle ? line('none running', 'none', true) : [
      tiles,
      <Box key="bar">{bar}</Box>,
      line(legend, 'legend', true),
      ...(live.rows.length ? live.rows.slice(0, CARDS).map(agentCard) : [line('none running', 'none', true)]),
      ...(more > 0 ? [line(`+${more} more`, 'more', true)] : []),
      ...finished,
    ]
    return (
      <Box flexDirection="column">
        <Box columnGap={1}>
          <Text bold>{`📊 ${name || 'Dashboard'}`}</Text>
          {chip(isStale ? 'partial' : 'live', isStale ? 'warning' : 'success')}
        </Box>
        <Box flexWrap="wrap" columnGap={1}>
          {[...list, { title: 'Left undone', count: open.length, rows: [] }].map(s => (
            <Box key={`tile-${s.title}`} width={tileWidth} flexDirection="column" borderStyle="round" borderColor={needsAction(s) ? 'error' : 'subtle'} paddingX={1}>
              <Text bold color={tileColor(s)} dimColor={!!s.note}>
                {`${ICON[s.title] ?? ''} ${s.note ? '–' : s.count}`}
              </Text>
              {line(s.note ? `${s.title} · ${s.note}` : s.title, 'label', true)}
            </Box>
          ))}
        </Box>
        {card('🤖 Agents', agentBody, 'Agents')}
        {card('💬 Now', line(now || 'nothing yet', 'now', !now))}
        {open.length > 0 && (
          <Box flexDirection="column" borderStyle="round" borderColor="error" paddingX={1}>
            <Box>
              <Box flexGrow={1}>
                <Text bold color="error">{`⚠️ Left undone ${open.length}`}</Text>
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
          .map(s => card(`${ICON[s.title] ?? ''} ${s.title}`, s.rows.map((row, i) => line(row, `${s.title}${i}`)), s.title))}
      </Box>
    )
  })
}
