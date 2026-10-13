import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

import { dotSvg } from './look'

// One test per state in tasks/plans/panel-040-mocks.html: docked full pane, not docked (band), no build running.
const PANE = (placement: 'dock' | 'inline') =>
  ({ component: 'Pane', requestId: 'side-panel', props: { title: 'Dashboard', isFocused: false, bodyColumns: 46, placement, scroll: { offset: 0, bodyRows: 40 }, view: {} } }) as const
const WIDE = { columns: 200, rows: 50, isFullscreen: true }
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as const
const K = 'tdd-pipeline:'
// A linked worktree on feat/x: what `.git` and its gitdir hold.
const FILES: Record<string, string> = { '.git': 'gitdir: /r/.git/worktrees/wt\n', '/r/.git/worktrees/wt/HEAD': 'ref: refs/heads/feat/x\n' }

type On = Parameters<TestBody>[1]
type Listed = { id: string; type: string; status: string; description?: string; parentId?: string }
// The engine beneath the side panel, started 71 minutes ago in a worktree, with `list` as $.agent.list().
async function world($: Engine, on: On, list: Listed[], placed = true) {
  const clock = mock.clock(on, { now: 71 * 60_000 })
  mock.store(on)
  on('agent.list', () => ({ value: list.map(a => ({ description: '', ...a })) }) as never)
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: (e as { description: string }).description }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 141_000, window: 1_000_000 }, rateLimits: [], cost: { usd: 2 } } }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: undefined }) as never)
  on('ui.panes', () => ({ value: [{ id: 'side-panel', title: 'Dashboard', isShown: true, isFocused: false, isPlaced: placed }] }) as never)
  on('session.cwd', () => ({ value: '/x/repo' }) as never)
  // The engine hands fs.read an absolute path: `.git` arrives resolved against the working directory.
  on('fs.read', ($, e) => {
    const k = Object.keys(FILES).find(f => e.path === f || e.path.endsWith(`/${f}`))
    return (k ? { value: FILES[k] } : { deny: 'no file' }) as never
  })
  on('session.start', () => ({ cwd: '/x/repo' }) as never)
  on('tool.call', () => ({ result: '' }) as never)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as never)
  await $.session.start({ source: 'startup', cwd: '/x/repo' } as never)
  // Spawns as the engine reports them: the description doubles as the id here.
  for (const a of list) await $.agent.spawn({ subagentType: a.type, description: a.id, prompt: '', ...(a.parentId ? { parentAgentId: a.parentId } : {}) } as never)
  await clock.advance(3_100)
  return clock
}

test('docked pane: header with model, timer and worktree branch; Cache card; rail and tree; the band hides', async ($, on) => {
  const clock = await world($, on, [
    { id: 'PRB-1', type: `${K}build-coordinator`, status: 'waiting' },
    { id: 'tw', type: `${K}test-writer`, status: 'running', parentId: 'PRB-1' },
  ])
  await $.tool.call({ tool: 'Read', file_path: '/repo/tests/WordCounterTest.kt', agentId: 'tw' } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: { model: 'claude-opus-5-5[1m]' } } as never)
  await clock.advance(3_000) // the 3s poll folds the tool in
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'side-panel', surface, ...PANE('dock') })
    const has = async (text: RegExp) => expect(await ui.find({ type: 'Text', text })).toBeDefined()
    if (surface === 'terminal') {
      await has(/^opus-5-5 · 71m$/)
      await has(/^⎇ feat\/x ⑂ wt$/)
      await has(/^ {7}sonnet-5-5 · now Read WordCounterTest\.kt$/) // dim line under the helper, under its tree pad
      expect(await ui.find({ type: 'Text', text: /📊|🤖/ })).toBeUndefined()
    } else {
      await has(/^opus-5-5 · feat\/x ⑂ wt · 71m$/)
      await has(/^test-writer · sonnet-5-5 · now Read WordCounterTest\.kt$/)
      // find() takes only type/key/text: walk the drawing for every SVG's alt. A status dot per agent, no avatar.
      type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
      const alts = (n: Node): unknown[] => [...(n.type === 'Svg' ? [n.props?.alt] : []), ...(n.children ?? []).flatMap(c => alts(c as Node))]
      expect(alts((await ui.drawn()) as Node)).toEqual(['cache 100% warm', 'waiting', 'running'])
    }
    await has(/^Cache$/)
    await has(/^● cache warm 59m$/) // warm since the turn 3s ago
    await has(/^ctx 141k · rewrite ≈ \$\?$/)
    expect((await ui.find({ key: 'end' }))?.props.hotkey).toBeUndefined() // the pane's a-i keys own c and e
    await has(/^◉━━━━━━━$/) // tests is the stage now
    await has(/^tests {3}$/)
    await has(/^└─$/)
    await has(/^PRB-1 · /)
    await ui.unmount()
  }
  // Docked (fullscreen, wide, pane open): the band leaves the cache to the card. A narrow window brings it back.
  const band = await $.ui.mount({ plugin: 'side-panel', surface: 'terminal', ...BAND, viewport: WIDE })
  expect(await band.find({ key: 'end' })).toBeUndefined()
  await band.unmount()
  const narrow = await $.ui.mount({ plugin: 'side-panel', surface: 'terminal', ...BAND, viewport: { ...WIDE, columns: 109 } })
  expect((await narrow.find({ key: 'end' }))?.props.hotkey).toBe('e')
  await narrow.unmount()
})

test('a pane opened unasked that still waits for room leaves the band up, however wide', async ($, on) => {
  await world($, on, [], false)
  const band = await $.ui.mount({ plugin: 'side-panel', surface: 'terminal', ...BAND, viewport: WIDE })
  expect((await band.find({ key: 'end' }))?.props.hotkey).toBe('e')
  await band.unmount()
})

test('not docked: the pane draws no Cache card and the band carries it', async ($, on) => {
  await world($, on, [])
  const pane = await $.ui.mount({ plugin: 'side-panel', surface: 'terminal', ...PANE('inline') })
  expect(await pane.find({ type: 'Text', text: /^Cache$/ })).toBeUndefined()
  await pane.unmount()
  const band = await $.ui.mount({ plugin: 'side-panel', surface: 'terminal', ...BAND, viewport: { ...WIDE, isFullscreen: false } })
  expect((await band.find({ key: 'end' }))?.props.hotkey).toBe('e')
  expect(await band.find({ type: 'Text', text: /^○ no cache yet$/ })).toBeDefined()
  await band.unmount()
})

test('no build running: a plain tree under a running count, no rail', async ($, on) => {
  await world($, on, [
    { id: 'ex', type: 'Explore', status: 'running' },
    { id: 'gp', type: 'general-purpose', status: 'running', parentId: 'ex' },
  ])
  const ui = await $.ui.mount({ plugin: 'side-panel', surface: 'terminal', ...PANE('dock') })
  expect(await ui.find({ type: 'Text', text: /◉|●━/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^2 running · ≈\$0\.00$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Explore$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ EX $/ })).toBeDefined() // initials chip, no emoji face
  expect(await ui.find({ type: 'Text', text: /^general-purpose$/ })).toBeDefined()
  await ui.unmount()
})

test('idle pane: one agents line, emoji only off the terminal; a subagent hand-back is not the topic', async ($, on) => {
  await world($, on, [])
  await $.prompt.submit({ text: '<agent-message from="a1">\n[Subagent hand-back] done', origin: { kind: 'peer' } } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'side-panel', surface, ...PANE('dock') })
    expect((await ui.find({ type: 'Text', text: ' live ' }))?.props.backgroundColor).toBe('success')
    expect(await ui.find({ type: 'Text', text: /^none running$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: surface === 'terminal' ? /^repo$/ : /^📊 repo$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: surface === 'terminal' ? /^Agents$/ : /^🤖 Agents$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^nothing yet$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Left undone/ })).toBeUndefined()
    await ui.unmount()
  }
  await $.prompt.submit({ text: 'fix the band', origin: { kind: 'composer' } } as never)
  const ui = await $.ui.mount({ plugin: 'side-panel', surface: 'terminal', ...PANE('dock') })
  expect(await ui.find({ type: 'Text', text: /^fix the band$/ })).toBeDefined()
  await ui.unmount()
})

test('desktop dot: pulses only while working, one class per status', () => {
  expect(dotSvg('working')).toContain('class="working pulse"')
  for (const d of ['waiting', 'done', 'stuck'] as const) expect(dotSvg(d)).toContain(`class="${d}"`)
  expect(dotSvg('done')).not.toContain('done pulse')
})

test('a still-installed cache-keeper holding /cachekeeper: the pane still opens and a toast says to uninstall it', async ($, on) => {
  const clock = mock.clock(on)
  const opened: string[] = []
  const toasts: string[] = []
  on('command.register', ($, e) => (e.name === 'cachekeeper' ? { deny: 'the plugin cache-keeper registered it already' } : { value: undefined }) as never)
  on('ui.open', ($, e) => (opened.push(e.id), { value: undefined }) as never)
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }) as never)
  on('session.cwd', () => ({ value: '/x/repo' }) as never)
  on('fs.read', () => ({ deny: 'no file' }) as never)
  on('session.start', () => ({ cwd: '/x/repo' }) as never)
  await $.session.start({ source: 'startup', cwd: '/x/repo' } as never)
  await clock.settle() // the start's unawaited refresh finishes inside the test
  expect(opened).toEqual(['side-panel'])
  expect(toasts).toEqual(['cache-keeper is still installed: side-panel 0.4.0 carries the cache now. Run /plugin uninstall cache-keeper@claude-tdd-kit'])
})
