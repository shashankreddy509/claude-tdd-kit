// The one cache view (moved in from cache-keeper 0.2.0): a wrapped row above the prompt while the pane is not
// docked, the pane's Cache card while it is. Same pieces in the same order; buttons run the same commands.
import type { RenderSurface } from 'claude-code'

import type { CacheState } from './cache'
import { filled, leftText, warmthSvg } from './cache'
import type { Ui } from './look'
import { svgOf } from './look'

const WARMTH_CELLS = 10
export type CacheView = { state: CacheState | null; stats: string[][]; eating: string }

export function cacheView(ui: Ui, surface: RenderSurface, v: CacheView, run: (command: string) => void, band: boolean) {
  const { Box, Button, Text } = ui
  const s = v.state
  const head = s === null ? <Text dimColor>○ no cache yet</Text> : <Text bold color={s.tone}>{`● cache ${s.warm ? `warm ${leftText(s.msLeft)}` : 'cold'}`}</Text>
  const Svg = svgOf(ui, surface)
  let warmth = null
  if (s && Svg) warmth = <Svg source={warmthSvg(s.left, s.tone)} alt={`cache ${Math.round(s.left * 100)}% warm`} />
  else if (s)
    warmth = (
      <Box key="warmth">
        <Text color={s.tone}>{'━'.repeat(filled(s.left, WARMTH_CELLS))}</Text>
        <Text color="subtle">{'━'.repeat(WARMTH_CELLS - filled(s.left, WARMTH_CELLS))}</Text>
      </Box>
    )
  // The band runs every figure into one row; the card gives each group its own line.
  const stats = band ? [<Text dimColor>{v.stats.flat().map(p => `| ${p}`).join(' ')}</Text>] : v.stats.map(g => <Text dimColor wrap="truncate-end">{g.join(' · ')}</Text>)
  // One command per button: end-session leaves room to check todos before clear. Hotkeys only on the band: in the
  // pane, Left undone's a-i keys hold c and e.
  const hotkey = (k: string) => (band ? k : undefined)
  const actions = (
    <Box key="actions" columnGap={1}>
      <Button key="end" variant="primary" label="end" hotkey={hotkey('e')} onPress={() => run('dev-day:end-session')} />
      <Button key="clear" label="clear" hotkey={hotkey('c')} onPress={() => run('clear')} />
      <Button key="start" label="start" hotkey={hotkey('s')} onPress={() => run('dev-day:start-session')} />
    </Box>
  )
  return (
    <Box flexDirection="column">
      {/* The band wraps so the buttons drop to their own line in a narrow window instead of being clipped. */}
      {band ? (
        <Box key="row" columnGap={1} alignItems="center" flexWrap="wrap">
          {head}
          {warmth}
          {stats}
          {actions}
        </Box>
      ) : (
        [
          <Box key="row" columnGap={1} alignItems="center">
            {head}
            {warmth}
          </Box>,
          ...stats,
          actions,
        ]
      )}
      {v.eating ? <Text dimColor wrap="truncate-end">{`eating: ${v.eating}`}</Text> : null}
    </Box>
  )
}
