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

test('agents card: a live agent gets the count bar and a text row with its status chip', async ($, on) => {
  const clock = mock.clock(on)
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'map the mods', type: 'Explore', status: 'running' }] }) as never)
  // The world beneath session.start: commands, the pane, cwd and files answer as nothing special.
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: undefined }) as never)
  on('session.cwd', () => ({ value: '/x/repo' }) as never)
  on('fs.read', () => ({ deny: 'no file' }) as never)
  on('session.start', () => ({ cwd: '/x/repo' }) as never)
  await $.session.start({ source: 'startup', cwd: '/x/repo' } as never)
  await clock.advance(3_100)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'side-panel', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: 'map the mods' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Jira/ })).toBeUndefined() // no Jira line in the repo, no tile
    expect((await ui.find({ type: 'Text', text: ' running ' }))?.props.backgroundColor).toBe('success')
    if (surface === 'desktop') expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Agents: 1 working · 0 waiting · 0 done')
    else expect(await ui.find({ type: 'Text', text: /━/ })).toBeDefined()
    await ui.unmount()
  }
})
