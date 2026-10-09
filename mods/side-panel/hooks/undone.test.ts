import { expect, test } from 'claude-code/testing'

import { MAX_UNDONE, addUndone, doItNow, fileTodos } from './undone'

test('file TODOs and skipped tests: only lines this write added', () => {
  const before = 'a()\n// TODO: old one\n'
  const after = 'a()\n// TODO: old one\n// TODO: retry with backoff\nit.skip("flaky", f)\nb()\n'
  expect(fileTodos('/x/src/retry.ts', after, before)).toEqual([
    'retry.ts: // TODO: retry with backoff',
    'retry.ts: it.skip("flaky", f)',
  ])
  expect(fileTodos('t.py', '@pytest.mark.skip\nok = 1\n')).toEqual(['t.py: @pytest.mark.skip'])
  expect(fileTodos('a.ts', 'const todo = 1\n')).toEqual([])
  const skips = ['@Disabled("flaky")', 't.Skip("needs db")', '#[ignore]', 'throw XCTSkip("ci")', '@Test(.disabled("slow"))']
  expect(fileTodos('s.txt', skips.join('\n'))).toEqual(skips.map(l => `s.txt: ${l}`))
  expect(fileTodos('s.go', 't.Skipped()\n')).toEqual([])
})

test('new entries on top, repeats dropped, capped', () => {
  const one = addUndone([], ['a', 'a', 'b'])
  expect(one).toEqual([{ text: 'a' }, { text: 'b' }])
  expect(addUndone(one, ['b', 'c'])[0]).toEqual({ text: 'c' })
  expect(addUndone(one, ['b', 'c']).length).toBe(3)
  const many = addUndone([], Array.from({ length: 20 }, (_, i) => `t${i}`))
  expect(many.length).toBe(MAX_UNDONE)
})

test('do it now prompt', () => {
  expect(doItNow({ text: 'run the restart check.' })).toBe('You left this undone: run the restart check. Do it now.')
})
