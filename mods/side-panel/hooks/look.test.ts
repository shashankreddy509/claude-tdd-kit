import { expect, mock, test } from 'claude-code/testing'

import { barSvg, dotSvg, segments } from './look'

const PANE = { component: 'Pane', requestId: 'side-panel', props: { title: 'Dashboard', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } } as const

test('count bar: fills the width by share, every non-zero part keeps a cell', () => {
  expect(segments([2, 1, 1, 0], 20)).toEqual([10, 5, 5, 0])
  expect(segments([100, 1, 0, 0], 10)).toEqual([9, 1, 0, 0])
  expect(segments([1, 1, 1], 10).reduce((a, b) => a + b, 0)).toBe(10)
  expect(segments([0, 0, 0, 0], 10)).toEqual([0, 0, 0, 0])
})

test('desktop bar and dot: stretchable bar, no text, a pulse only while working', () => {
  const bar = barSvg({ working: 1, waiting: 1, done: 2, stuck: 0 })
  expect(bar).toContain('preserveAspectRatio="none"')
  expect(bar).not.toContain('<text')
  expect(bar).not.toContain('class="stuck"')
  expect(bar.match(/<rect class="(working|waiting|done)"/g)?.length).toBe(3)
  expect(dotSvg(true)).toContain('class="working pulse"')
  expect(dotSvg(false)).toContain('class="waiting"')
  expect(dotSvg(false)).not.toContain('class="working')
})

test('agents card: one line when idle, on every surface', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'side-panel', surface, ...PANE })
    // Idle: one dim line, no bar on either surface.
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /━/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: ' live ' }))?.props.backgroundColor).toBe('success')
    expect(await ui.find({ type: 'Text', text: 'none running' })).toBeDefined() // rows stay text on every surface
    await ui.unmount()
  }
})

test('agents card: tiles, then a card per live agent with avatar, model · effort and its share of cost', async ($, on) => {
  const clock = mock.clock(on)
  on('agent.list', () => ({ value: [
    { id: 'a1', description: 'map the mods', type: 'Explore', status: 'running' },
    { id: 'a2', description: 'old run', type: 'Explore', status: 'completed' },
  ] }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [], cost: { usd: 2 } } }) as never)
  // The world beneath session.start: commands, the pane, cwd and files answer as nothing special.
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: undefined }) as never)
  on('session.cwd', () => ({ value: '/x/repo' }) as never)
  on('fs.read', () => ({ deny: 'no file' }) as never)
  on('session.start', () => ({ cwd: '/x/repo' }) as never)
  // The model beneath turn.step answers with usage; one main step and one subagent step, same model.
  on('turn.step', async function* (_$, e) {
    const tokens = e.agentId ? 30_000 : 70_000
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: tokens, output_tokens: 0, model: 'claude-opus-5-5' } } as never
  })
  await $.session.start({ source: 'startup', cwd: '/x/repo' } as never)
  for (const agentId of [undefined, 'a1']) {
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5[1m]', effort: 'high', messageCount: 1, ...(agentId ? { agentId } : {}) })
    for await (const _ of stream) void _
  }
  await clock.advance(3_100)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'side-panel', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'map the mods' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Jira/ })).toBeUndefined() // no Jira line in the repo, no tile
    expect((await ui.find({ type: 'Text', text: ' running ' }))?.props.backgroundColor).toBe('success')
    expect(await ui.find({ type: 'Text', text: 'opus-5-5 · high' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ctx 3% · 30\.0k ≈\$0\.60 · / })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '≈$0.60' })).toBeDefined() // Cost tile
    expect(await ui.find({ type: 'Text', text: 'Tokens' })).toBeDefined()
    expect((await ui.find({ type: 'Button', key: 'finished' }))?.props.label).toBe('▸ Finished · 1')
    if (surface === 'desktop') {
      expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Agents: 1 working · 0 waiting · 1 done')
      // find() only takes type/key/text; walk the drawing for the avatar by its alt.
      type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
      const byAlt = (n: Node): Node | undefined =>
        n.props?.alt === 'map the mods avatar' ? n : (n.children ?? []).map(c => byAlt(c as Node)).find(Boolean)
      const avatar = byAlt((await ui.drawn()) as Node)
      expect([avatar?.props?.width, avatar?.props?.height]).toEqual([27, 48]) // fixed size: never stretched
    } else {
      expect(await ui.find({ type: 'Text', text: /━/ })).toBeDefined()
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    }
    await ui.unmount()
  }
})
