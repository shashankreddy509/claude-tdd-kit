import { expect, test } from 'claude-code/testing'

import type { Span } from './agents'
import { MAIN, addStep, agentBoard, clock, metaLine, statsLine, tokensText, track } from './agents'

// Step usage as turn.step reported it live on 2026-10-09 (an Explore subagent's first step).
const STEP = { input_tokens: 2, output_tokens: 283, cache_read_input_tokens: 100, cache_creation_input_tokens: 21_997 }
const OPUS = 'claude-opus-5-5[1m]'

test('a step adds input, cache read, cache write and output to its loop; ctx base is the input side', () => {
  const one = addStep({}, 'a1', OPUS, 'high', STEP)
  expect(one).toEqual({ a1: { model: OPUS, effort: 'high', tokens: 22_382, lastInput: 22_099 } })
  const two = addStep(one, 'a1', OPUS, 'high', { input_tokens: 1, output_tokens: 9 })
  expect(two.a1).toEqual({ model: OPUS, effort: 'high', tokens: 22_392, lastInput: 1 })
  expect(addStep(one, 'a1', OPUS, 'high', null)).toBe(one) // no response: nothing counted
})

test('spans open on first sight and stop growing once the agent finishes', () => {
  const spans: Record<string, Span> = {}
  track(spans, [{ id: 'a', description: '', type: 'Explore', status: 'running' }], 1_000)
  track(spans, [{ id: 'a', description: '', type: 'Explore', status: 'running' }], 5_000)
  track(spans, [{ id: 'a', description: '', type: 'Explore', status: 'completed' }], 9_000)
  expect(spans.a).toEqual({ from: 1_000, to: 5_000 })
})

const LIST = [
  { id: 'a', description: 'Summarise video', type: 'general-purpose', status: 'running' },
  { id: 'b', description: '', type: 'Explore', status: 'waiting' },
  { id: 'c', description: 'old', type: 'Explore', status: 'completed' },
  { id: 'd', description: 'bad', type: 'Explore', status: 'failed' },
]
const SPANS = { a: { from: 1_000, to: 62_000 }, b: { from: 60_000, to: 62_000 }, c: { from: 0, to: 30_000 } }
const USAGE = {
  [MAIN]: { model: OPUS, effort: 'high', tokens: 600, lastInput: 500 },
  a: { model: OPUS, effort: 'high', tokens: 300, lastInput: 250_000 },
  c: { model: 'claude-haiku-5-5', effort: 'medium', tokens: 100, lastInput: 90 },
}

test('board: live cards, finished group, cost shared over every loop with main counted, ctx only on the session model', () => {
  const board = agentBoard(LIST, SPANS, USAGE, { usd: 2, window: 1_000_000 })
  expect(board.counts).toEqual({ working: 1, waiting: 1, done: 1, stuck: 1 })
  expect(board.rows.map(a => a.label)).toEqual(['Summarise video', 'Explore'])
  expect(board.finished.map(a => a.label)).toEqual(['old', 'bad'])
  const [a, b] = board.rows
  expect(a).toEqual({ label: 'Summarise video', status: 'running', elapsed: '1:01', model: OPUS, effort: 'high', tokens: 300, usd: 0.6, ctx: 25 })
  expect(b?.usd).toBe(0) // no steps seen yet: no tokens, no share
  expect(b?.ctx).toBeUndefined()
  expect(board.finished[0]?.ctx).toBeUndefined() // haiku: window unknown, no ctx %
  expect(board.finished[0]?.usd).toBe(0.2)
  expect(board.totals).toEqual({ usd: 0.8, tokens: 400, time: '1:02' })
  expect(agentBoard([], {}, {}, { usd: 1, window: 0 }).totals).toEqual({ usd: 0, tokens: 0, time: '0:00' })
})

test('card lines: short model name with effort, ctx only when known', () => {
  const a = { label: 'x', status: 'running', elapsed: '0:52', model: OPUS, effort: 'high', tokens: 23_600, usd: 0.144, ctx: 12 }
  expect(metaLine(a)).toBe('opus-5-5 · high')
  expect(statsLine(a)).toBe('ctx 12% · 23.6k ≈$0.14 · 0:52')
  expect(statsLine({ ...a, ctx: undefined })).toBe('23.6k ≈$0.14 · 0:52')
  expect(metaLine({ ...a, model: '', effort: '' })).toBe('')
  expect([tokensText(999), tokensText(1_500_000)]).toEqual(['999', '1.5M'])
  expect(clock(-5)).toBe('0:00')
})
