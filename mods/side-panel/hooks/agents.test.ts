import { expect, test } from 'claude-code/testing'

import { MAIN, addStep, agentBoard, clock, metaLine, modelText, nowText, seen } from './agents'

// Step usage as turn.step reported it live on 2026-10-09 (an Explore subagent's first step).
const STEP = { input_tokens: 2, output_tokens: 283, cache_read_input_tokens: 100, cache_creation_input_tokens: 21_997 }
const OPUS = 'claude-opus-5-5[1m]'

test('a step adds input, cache read, cache write and output to its loop', () => {
  const one = addStep({}, 'a1', OPUS, 'high', STEP)
  expect(one).toEqual({ a1: { model: OPUS, effort: 'high', tokens: 22_382 } })
  expect(addStep(one, 'a1', OPUS, 'high', { input_tokens: 1, output_tokens: 9 }).a1?.tokens).toBe(22_392)
  expect(addStep(one, 'a1', OPUS, 'high', null)).toBe(one) // no response: nothing counted
})

test('seen: an agent the spawn hook missed joins with its parent; live ones are stamped, finished ones keep their stamp', () => {
  const spawned = { a: { id: 'a', type: 'Explore', description: '', model: OPUS, from: 0, to: 500 } }
  const out = seen(spawned, [
    { id: 'a', description: '', type: 'Explore', status: 'completed' },
    { id: 'b', description: 'late', type: 'general-purpose', status: 'running', parentId: 'a' },
  ], 9_000)
  expect(out.a).toEqual(spawned.a)
  expect(out.b).toEqual({ id: 'b', type: 'general-purpose', description: 'late', model: '', from: 9_000, to: 9_000, parent: 'a' })
  expect(seen({}, [{ id: 'c', description: '', type: 'Explore', status: 'running' }], 1).c?.parent).toBeUndefined()
})

const SPAWNS = {
  bc: { id: 'bc', type: 'tdd-pipeline:build-coordinator', description: 'Run TDD pipeline PRB-1', model: 'claude-sonnet-5-5', from: 1_000 },
  tw: { id: 'tw', type: 'tdd-pipeline:test-writer', parent: 'bc', description: 'Write tests', model: 'claude-sonnet-5-5', from: 2_000, to: 30_000 },
}
const USAGE = {
  [MAIN]: { model: OPUS, effort: 'high', tokens: 600 },
  bc: { model: 'claude-sonnet-5-5', effort: 'medium', tokens: 300 },
  tw: { model: 'claude-sonnet-5-5', effort: '', tokens: 100 },
}

test('board: oldest first; gone from the poll means completed; elapsed stops at the last stamp; cost shared over every loop', () => {
  const board = agentBoard(SPAWNS, [{ id: 'bc', description: '', type: 'x', status: 'waiting' }], USAGE, { bc: 'Task', tw: 'Edit a.kt' }, 2, 62_000)
  expect(board.map(a => [a.id, a.status, a.elapsed])).toEqual([['bc', 'waiting', '1:01'], ['tw', 'completed', '0:28']])
  expect(board[0]).toMatchObject({ effort: 'medium', tokens: 300, usd: 0.6, now: 'Task' })
  expect(board[1]?.now).toBeUndefined() // finished: no "now"
  expect(board[1]?.usd).toBe(0.2)
  expect(agentBoard({ x: { id: 'x', type: 'Explore', description: '', model: OPUS, from: 0 } }, [], {}, {}, 1, 5_000)[0]).toMatchObject({ model: OPUS, usd: 0, elapsed: '0:00' })
})

test('model text: one strip for the header and every row', () => {
  expect(modelText(OPUS)).toBe('opus-5-5')
  expect(metaLine({ model: OPUS, effort: 'high' })).toBe('opus-5-5 · high')
  expect(metaLine({ model: '', effort: '' })).toBe('')
  expect(clock(-5)).toBe('0:00')
})

test('now: the tool and the file name, the command word, or the pattern', () => {
  expect(nowText('Edit', { file_path: '/repo/tests/WordCounterTest.kt' })).toBe('Edit WordCounterTest.kt')
  expect(nowText('Bash', { command: 'python3 -m unittest' })).toBe('Bash python3')
  expect(nowText('Grep', { pattern: 'slugify' })).toBe('Grep slugify')
  expect(nowText('Agent', { prompt: 'x' })).toBe('Agent')
})
