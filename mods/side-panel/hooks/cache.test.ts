import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { cacheState, cacheStats, eatingText, filled, leftText, limitsText, warmthSvg } from './cache'

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

test('figures: context group then spend group; a group with nothing in it is dropped', () => {
  const limits = [{ kind: 'five_hour', percentUsed: 4.2 }, { kind: 'seven_day', percentUsed: 0 }, { kind: 'other', percentUsed: 50 }] as never
  expect(limitsText(limits)).toBe('5h 4% · week 0%')
  expect(cacheStats(141_000, 0.0000149, limits, 2.95)).toEqual([['ctx 141k', 'rewrite ≈ $2.10'], ['5h 4% · week 0%', 'session $2.95']])
  expect(cacheStats(141_000, undefined, [], undefined)).toEqual([['ctx 141k', 'rewrite ≈ $?']])
  expect(cacheStats(0, undefined, [], 0)).toEqual([['session $0.00']])
  expect([leftText(42 * 60_000 + 5), leftText(119_000), leftText(500)]).toEqual(['42m', '119s', '1s'])
})

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as const

// The world the side panel's hooks touch on a main turn, answering as nothing special.
type On = Parameters<TestBody>[1]
function quietWorld(on: On) {
  mock.clock(on)
  mock.store(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 0 }, rateLimits: [] } }) as never)
  on('session.cwd', () => ({ value: '/x/repo' }) as never)
  on('fs.read', () => ({ deny: 'no file' }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as never)
}

test('band: warmth bar is SVG on desktop, cells in the terminal; end, clear, start buttons each run one command', async ($, on) => {
  quietWorld(on)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: { model: 'm' } as never })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'side-panel', surface, ...BAND })
    expect(await ui.find({ key: 'handoff' })).toBeUndefined()
    const end = await ui.find({ key: 'end' })
    expect([end?.props.variant, end?.props.label, end?.props.hotkey]).toEqual(['primary', 'end', 'e'])
    expect((await ui.find({ key: 'clear' }))?.props.hotkey).toBe('c')
    expect((await ui.find({ key: 'start' }))?.props.hotkey).toBe('s')
    const actions = await ui.find({ key: 'actions' })
    expect(actions?.props.columnGap).toBe(1)
    expect(actions?.children?.map(c => (c as { props?: { key?: string } }).props?.key)).toEqual(['end', 'clear', 'start'])
    expect((await ui.find({ key: 'row' }))?.props.flexWrap).toBe('wrap')
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

test('band: each button runs exactly its one command, end never clears', async ($, on) => {
  quietWorld(on)
  const ran: string[] = []
  on('command.run', ($, e) => (ran.push(e.command), { text: '' }) as never)
  const ui = await $.ui.mount({ plugin: 'side-panel', surface: 'terminal', ...BAND })
  for (const key of ['end', 'clear', 'start']) await ui.press({ key })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(ran).toEqual(['dev-day:end-session', 'clear', 'dev-day:start-session'])
  await ui.unmount()
})
