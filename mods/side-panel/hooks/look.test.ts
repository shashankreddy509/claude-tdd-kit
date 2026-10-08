import { expect, test } from 'claude-code/testing'

import { agentSvg, segments } from './look'

const PANE = { component: 'Pane', requestId: 'side-panel', props: { title: 'Dashboard', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } } as const

test('count bar: fills the width by share, every non-zero part keeps a cell', () => {
  expect(segments([2, 1, 1, 0], 20)).toEqual([10, 5, 5, 0])
  expect(segments([100, 1, 0, 0], 10)).toEqual([9, 1, 0, 0])
  expect(segments([1, 1, 1], 10).reduce((a, b) => a + b, 0)).toBe(10)
  expect(segments([0, 0, 0, 0], 10)).toEqual([0, 0, 0, 0])
})

test('agent svg: a row per live agent, working ones pulse, labels escaped', () => {
  const svg = agentSvg({ working: 1, waiting: 1, done: 2, stuck: 0 }, [
    { label: 'map <mods> & tests', status: 'running', elapsed: '0:12' },
    { label: 'idle one', status: 'waiting', elapsed: '1:00' },
  ])
  expect(svg).toContain('map &#60;mods&#62; &#38; tests')
  expect(svg.match(/<circle/g)?.length).toBe(2)
  expect(svg.match(/pulse/g)?.length).toBe(2) // the CSS rule + the one working row
  expect(svg).not.toContain('class="stuck"')
  expect(agentSvg({ working: 0, waiting: 0, done: 0, stuck: 0 }, [])).toContain('none running')
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
    await ui.unmount()
  }
})
