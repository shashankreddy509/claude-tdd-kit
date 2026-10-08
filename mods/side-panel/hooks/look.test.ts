import { expect, test } from 'claude-code/testing'

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

test('agents card: SVG on desktop, theme-colored text bar in the terminal', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'side-panel', surface, ...PANE })
    const svg = await ui.find({ type: 'Svg' })
    if (surface === 'desktop') expect(svg?.props.alt).toMatch(/^Agents: 0 working/)
    else {
      expect(svg).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /━{8}/ })).toBeDefined()
    }
    expect((await ui.find({ type: 'Text', text: ' live ' }))?.props.backgroundColor).toBe('success')
    expect(await ui.find({ type: 'Text', text: 'none running' })).toBeDefined() // rows stay text on every surface
    await ui.unmount()
  }
})
