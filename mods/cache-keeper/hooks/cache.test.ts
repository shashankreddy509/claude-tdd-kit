import { expect, test } from 'claude-code/testing'

import { cacheState, eatingText } from './cache'

const H = 60 * 60_000

test('warm inside the ttl, cold at and after it', async () => {
  expect(cacheState(null, 0, H, null)).toBe(null)
  expect(cacheState(0, H - 1, H, null)?.warm).toBe(true)
  expect(cacheState(0, H, H, null)).toEqual({ warm: false, msLeft: 0, shouldWarn: false })
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
