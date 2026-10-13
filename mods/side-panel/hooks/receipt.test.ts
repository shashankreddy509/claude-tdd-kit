import { expect, mock, test } from 'claude-code/testing'

import type { Receipt, Repo } from './receipt'
import { items, parse, pickReceipt, readHead, shipState } from './receipt'

const SHA = 'a'.repeat(40)
// A receipt /ship lets through: complete, red then green, a clean review.
const CLEAN: Receipt = { sha: SHA, stage: 'complete', red: { exit: 1 }, green: { exit: 0 }, review: { critical: 0, must_fix: 0, warnings: 0, unverified: 0 } }
const ready = [{ level: 'ok', text: 'ready to /ship' }]
const stops = (r: Receipt, head = SHA, since?: number) => items(r, head, since).filter(i => i.level === 'stop').map(i => i.text)

// One fixture per row of tdd-pipeline/commands/ship.md step 0, in the table's order.
test('ship.md row: stage != complete stops and names the stage', () => {
  expect(stops({ ...CLEAN, stage: 'green' })).toEqual(['stopped at green'])
})

test('ship.md row: red.exit == 0, or null with no note, stops; null with a note passes', () => {
  expect(stops({ ...CLEAN, red: { exit: 0 } })).toEqual(['tests never failed'])
  expect(stops({ ...CLEAN, red: { exit: null } })).toEqual(['no red run recorded'])
  expect(stops({ ...CLEAN, red: undefined })).toEqual(['no red run recorded'])
  expect(items({ ...CLEAN, red: { exit: null, note: 'tests predate the fix' } }, SHA)).toEqual(ready)
})

test('ship.md row: green.exit != 0 stops', () => {
  expect(stops({ ...CLEAN, green: { exit: 1 } })).toEqual(['tests are red'])
  expect(stops({ ...CLEAN, green: undefined })).toEqual(['tests are red'])
})

test('ship.md row: review critical, must_fix or unverified > 0 stops and lists them', () => {
  expect(stops({ ...CLEAN, review: { critical: 1, must_fix: 0 } })).toEqual(['review: 1 critical'])
  expect(stops({ ...CLEAN, review: { must_fix: 2 } })).toEqual(['review: 2 must-fix'])
  expect(stops({ ...CLEAN, review: { unverified: 3 } })).toEqual(['review: 3 unverified'])
})

test('ship.md row: missing review block counts as zero', () => {
  expect(items({ ...CLEAN, review: undefined }, SHA)).toEqual(ready)
})

test('ship.md row: gating readback not ok, or a required key not seeded, stops', () => {
  expect(stops({ ...CLEAN, gating: { required: ['k'], seeded: ['k'], readback: 'failed' } })).toEqual(['kill-switch missing'])
  expect(stops({ ...CLEAN, gating: { required: ['k', 'j'], seeded: ['k'], readback: 'ok' } })).toEqual(['kill-switch missing'])
  expect(items({ ...CLEAN, gating: { required: ['k'], seeded: ['k'], readback: 'ok' } }, SHA)).toEqual(ready)
})

test('ship.md row: warnings warn with a count, beside the passing rows', () => {
  expect(items({ ...CLEAN, review: { warnings: 2 } }, SHA)).toEqual([
    { level: 'ok', text: 'tests red→green' },
    { level: 'ok', text: 'review' },
    { level: 'warn', text: '2 warnings' },
  ])
})

test('staleness: sha != HEAD stops with the count when known; HEAD unreadable shows nothing', () => {
  expect(stops(CLEAN, 'b'.repeat(40), 2)).toEqual(['receipt stale (2 commits since)'])
  expect(stops(CLEAN, 'b'.repeat(40))).toEqual(['receipt stale'])
  expect(items(CLEAN, SHA)).toEqual(ready)
  expect(items(CLEAN, undefined)).toEqual(ready)
})

test('tree: a muted item, never a ✓; no tree adds nothing', () => {
  const edits = { level: 'muted', text: 'edits checked at /ship' }
  expect(items({ ...CLEAN, tree: 'f00' }, SHA)).toEqual([...ready, edits])
  expect(items({ ...CLEAN, tree: 'f00', green: { exit: 1 } }, SHA).at(-1)).toEqual(edits)
})

test('malformed receipt: one stop item, never a throw', () => {
  for (const text of ['{oops', '', '[]', 'null']) expect(items(parse(text), SHA)).toEqual([{ level: 'stop', text: 'receipt unreadable' }])
})

// A worktree checkout: `.git` is a file naming the gitdir, the branch ref lives in the common dir's packed-refs.
const FILES: Record<string, string> = {
  '.git': 'gitdir: /repo/.git/worktrees/wt\n',
  '/repo/.git/worktrees/wt/HEAD': 'ref: refs/heads/feature/ST-248-band\n',
  '/repo/.git/worktrees/wt/commondir': '../..\n',
  '/repo/.git/worktrees/wt/../../packed-refs': `# pack-refs\n${'c'.repeat(40)} refs/heads/main\n${SHA} refs/heads/feature/ST-248-band\n`,
  'tasks/receipts/ST-248.json': JSON.stringify({ ...CLEAN, review: { warnings: 1 } }),
  'tasks/receipts/ST-300.json': JSON.stringify(CLEAN),
}
const fake = (files = FILES): Repo => ({
  read: p => (p in files ? Promise.resolve(files[p] as string) : Promise.reject(new Error('ENOENT'))),
  run: () => Promise.resolve({ exitCode: 0, stdout: '3\n', stderr: '' } as never),
})

test('HEAD and branch from a worktree .git file via commondir and packed-refs; worktree flag from the .git file', async () => {
  expect(await readHead(fake())).toEqual({ head: SHA, branch: 'feature/ST-248-band', worktree: true })
  const plain = fake({ '.git/HEAD': 'ref: refs/heads/main', '.git/refs/heads/main': SHA })
  expect(await readHead(plain)).toEqual({ head: SHA, branch: 'main', worktree: false })
  expect(await readHead(fake({ '.git/HEAD': SHA }))).toEqual({ head: SHA, worktree: false }) // detached: no branch
})

test('pick: only a receipt whose key the branch names, any case', async () => {
  expect((await pickReceipt(fake(), 'feature/ST-248-band'))?.key).toBe('ST-248')
  expect((await pickReceipt(fake(), 'fix/st-300'))?.key).toBe('ST-300')
  expect(await pickReceipt(fake(), 'feature/ST-999-gone')).toBe(undefined)
})

// Receipts present, but main, a detached HEAD or a branch with no key shows nothing.
test('no branch key: nothing to show', async () => {
  const head = (text: string) => fake({ ...FILES, '/repo/.git/worktrees/wt/HEAD': text })
  expect(await shipState(head('ref: refs/heads/main'))).toBe(null)
  expect(await shipState(head(SHA))).toBe(null)
  expect(await shipState(head('ref: refs/heads/feat/ship-band'))).toBe(null)
})

test('stale receipt counts commits since through git', async () => {
  const moved = fake({ ...FILES, '/repo/.git/worktrees/wt/refs/heads/feature/ST-248-band': 'b'.repeat(40) })
  expect(await shipState(moved)).toEqual({ key: 'ST-248', items: [
    { level: 'ok', text: 'tests red→green' },
    { level: 'ok', text: 'review' },
    { level: 'warn', text: '1 warning' },
    { level: 'stop', text: 'receipt stale (3 commits since)' },
  ] })
})

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} } } as const

test('band: its row over the plugins beneath, which still draw', async ($, on) => {
  // The engine hands the event an absolute path: a relative one resolved against the working directory.
  const file = (path: string) => Object.keys(FILES).find(k => path === k || path.endsWith(`/${k}`))
  on('fs.read', (_$, e) => { const k = file(e.path); return (k ? { value: FILES[k] } : { deny: 'ENOENT' }) as never })
  on('session.cwd', () => ({ value: '/repo' }) as never)
  on('turn.complete', () => ({ text: '' }))
  mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 0 }, rateLimits: [] } }) as never)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, { key: 'below' }, 'beneath') as never)
  // No main-turn usage: the cache band under the Ship row stays "no cache yet", with no warmth SVG.
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'side-panel', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'ST-248 ship ·' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '· ⚠ 1 warning' }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: 'beneath' })).toBeDefined()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  }
})
