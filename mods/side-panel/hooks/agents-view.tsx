// The Agents card, look B: the build's stage rail, then a tree of who spawned whom. The terminal gets an initials
// chip and the model on a dim line under each agent; the desktop a status dot and the model inline.
import type { RenderSurface } from 'claude-code'

import type { Agent } from '../types'
import { WORKING, isLive, metaLine } from './agents'
import type { Dot, Ui } from './look'
import { chip, dotSvg, line, svgOf } from './look'
import { agentsLook, initials, shortType } from './rail'

// Rail cell width: the longest label ("explore", "run r5") plus a gap.
const CELL = 8
const GLYPH = { done: '●', now: '◉', todo: '○' }
const TONE = { done: 'success', now: 'claude', todo: 'subtle' }

function dotOf(status: string): Dot {
  if (WORKING.has(status)) return 'working'
  if (isLive(status)) return 'waiting'
  return status === 'completed' ? 'done' : 'stuck'
}
const CHIP: Record<Dot, string> = { working: 'success', waiting: 'warning', done: 'subtle', stuck: 'error' }

export function agentsView(ui: Ui, surface: RenderSurface, agents: readonly Agent[]) {
  const { Box, Text } = ui
  const look = agentsLook(agents)
  const isTerminal = surface === 'terminal'
  const Svg = svgOf(ui, surface)
  const last = look.stages.length - 1
  const railRows = look.stages.length
    ? [
        <Text key="rail">
          {look.stages.map((s, i) => (
            <Text key={s.stage} color={TONE[s.state]}>{`${GLYPH[s.state]}${i < last ? '━'.repeat(CELL - 1) : ''}`}</Text>
          ))}
        </Text>,
        <Text key="stages" wrap="truncate-end">
          {look.stages.map(s => (
            <Text key={s.stage} bold={s.state === 'now'} dimColor={s.state !== 'now'}>{s.label.padEnd(CELL)}</Text>
          ))}
        </Text>,
      ]
    : []
  const rows = look.rows.flatMap(({ agent: a, lead, pad }, i) => {
    const dot = dotOf(a.status)
    const meta = [metaLine(a), a.now ? `now ${a.now}` : ''].filter(Boolean).join(' · ')
    const row = (
      <Box key={`agent${i}`} columnGap={1}>
        {lead ? <Text>{lead.trimEnd()}</Text> : null}
        {Svg ? <Svg source={dotSvg(dot)} alt={a.status} width={10} height={10} isInteractive={dot === 'working' || undefined} /> : chip(ui, initials(a.type), 'claude')}
        <Box flexGrow={1}>{line(ui, isTerminal || !meta ? shortType(a.type) : `${shortType(a.type)} · ${meta}`, 'name')}</Box>
        {chip(ui, a.status === 'completed' ? 'done' : a.status, CHIP[dot])}
        <Text>{a.elapsed}</Text>
      </Box>
    )
    return isTerminal && meta ? [row, line(ui, `${pad}    ${meta}`, `meta${i}`, true)] : [row]
  })
  return { title: look.title, body: rows.length ? [...railRows, ...rows] : line(ui, 'none running', 'none', true) }
}
