import { expect, mock, test } from 'claude-code/testing'

import { cacheState, eatingText, filled, warmthSvg } from './cache'

const H = 60 * 60_000

test('warm inside the ttl, cold at and after it', async () => {
  expect(cacheState(null, 0, H, null)).toBe(null)
  expect(cacheState(0, H - 1, H, null)?.warm).toBe(true)
  expect(cacheState(0, H, H, null)).toEqual({ warm: false, msLeft: 0, shouldWarn: false, left: 0, tone: 'error' })
  expect(cacheState(0, 2 * H, H, null)?.msLeft).toBe(0)
})

test('warns once, 5 min before a 1h ttl and ttl/5 before a short one', async () => {
  expect(cacheState(0, H - 5 * 60_000 - 1, H, null)?.shouldWarn).toBe(false)
  expect(cacheState(0, H - 5 * 60_000, H, null)?.shouldWarn).toBe(true)
  expect(cacheState(0, H - 60_000, H, 0)?.shouldWarn).toBe(false)
  expect(cacheState(0, 2 * 60_000 - 24_000, 2 * 60_000, null)?.shouldWarn).toBe(true)
  expect(cacheState(0, 2 * 60_000 - 25_000, 2 * 60_000, null)?.shouldWarn).toBe(false)
})

test('eating: biggest used rows first, trim hint on the biggest cuttable one', () => {
  const rows = [
    { name: 'Skills', tokens: 10_400, kind: 'used' },
    { name: 'System tools', tokens: 26_000, kind: 'used' },
    { name: 'Messages', tokens: 36_000, kind: 'used' },
    { name: 'Memory files', tokens: 9_800, kind: 'used' },
    { name: 'MCP tools', tokens: 650_000, kind: 'deferred' },
    { name: 'Free space', tokens: 800_000, kind: 'free' },
  ]
  expect(eatingText(rows)).toBe('messages 36k · system tools 26k · skills 10k ← trim · memory files 10k')
  expect(eatingText(rows.map(r => (r.name === 'Skills' ? { ...r, tokens: 5_000 } : r)))).not.toContain('trim')
  expect(eatingText([])).toBe('')
})

test('warmth: share left, tone by lead, bar cells', () => {
  expect(cacheState(0, H / 4, H, null)).toMatchObject({ left: 0.75, tone: 'success' })
  expect(cacheState(0, H - 60_000, H, 0)).toMatchObject({ tone: 'warning', shouldWarn: false })
  expect(filled(0.75, 10)).toBe(8)
  expect(filled(0.01, 10)).toBe(1)
  expect(filled(0, 10)).toBe(0)
  expect(warmthSvg(0.5, 'warning')).toContain('width="60"')
  expect(warmthSvg(0.5, 'warning')).toContain('#d29922')
})

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as const

test('band: warmth bar is SVG on desktop, cells in the terminal; handoff is the primary button, clear sits beside it with a gap', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.complete', () => ({ text: '' }))
  on('session.usage', () => ({ value: { context: { tokens: 0 }, rateLimits: [] } }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: { model: 'm' } as never })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'cache-keeper', surface, ...BAND })
    expect((await ui.find({ key: 'handoff' }))?.props.variant).toBe('primary')
    expect((await ui.find({ key: 'clear' }))?.props.hotkey).toBe('c')
    expect((await ui.find({ key: 'actions' }))?.props.columnGap).toBe(1)
    // Leaves (Text, Svg) drop their key, so the SVG is found by type.
    const svg = await ui.find({ type: 'Svg' })
    if (surface === 'desktop') expect(svg?.props.alt).toBe('cache 100% warm')
    else {
      expect(svg).toBeUndefined()
      expect((await ui.find({ key: 'warmth' }))?.text).toBe('━'.repeat(10))
    }
    await ui.unmount()
  }
})
