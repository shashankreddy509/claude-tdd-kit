import { expect, test } from 'claude-code/testing'

import { MAX_UNDONE, addUndone, doItNow, fileTodos, saidUndone } from './undone'

test('file TODOs and skipped tests: only lines this write added', () => {
  const before = 'a()\n// TODO: old one\n'
  const after = 'a()\n// TODO: old one\n// TODO: retry with backoff\nit.skip("flaky", f)\nb()\n'
  expect(fileTodos('/x/src/retry.ts', after, before)).toEqual([
    'retry.ts: // TODO: retry with backoff',
    'retry.ts: it.skip("flaky", f)',
  ])
  expect(fileTodos('t.py', '@pytest.mark.skip\nok = 1\n')).toEqual(['t.py: @pytest.mark.skip'])
  expect(fileTodos('a.ts', 'const todo = 1\n')).toEqual([])
})

test('reply lines that admit something was left undone', () => {
  const answer = [
    'Built it. All 7 tests pass.',
    '- I did not run the live restart check.',
    '- Tiles: not proven until your screenshot.',
    '```',
    '// TODO not yet in a code block',
    '```',
    'Everything else is done.',
  ].join('\n')
  expect(saidUndone(answer)).toEqual(['I did not run the live restart check.', 'Tiles: not proven until your screenshot.'])
  expect(saidUndone('All done, verified live.')).toEqual([])
})

test('new entries on top, repeats dropped, capped', () => {
  const one = addUndone([], 'said', ['a', 'a', 'b'])
  expect(one).toEqual([
    { source: 'said', text: 'a' },
    { source: 'said', text: 'b' },
  ])
  expect(addUndone(one, 'file', ['b', 'c'])[0]).toEqual({ source: 'file', text: 'c' })
  expect(addUndone(one, 'file', ['b', 'c']).length).toBe(3)
  const many = addUndone([], 'file', Array.from({ length: 20 }, (_, i) => `t${i}`))
  expect(many.length).toBe(MAX_UNDONE)
})

test('do it now prompt', () => {
  expect(doItNow({ source: 'said', text: 'run the restart check.' })).toBe('You left this undone: run the restart check. Do it now.')
})
