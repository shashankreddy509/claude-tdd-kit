import { expect, test } from 'claude-code/testing'

import { ROWS, agentBoard, clock, jiraKeyOf, paSections, todoSection, topicOf } from './panel'

// Payload shapes sampled from real cards/todos servers on 2026-10-07.
const CARDS = {
  stale: false,
  needs_you: [
    { source: 'jira', key: 'BTCWEB-222', text: 'BTCWEB-222 [HIGH] delivery_channels' },
    { source: 'calendar', key: 'cal-1', text: 'Dentist 3pm' },
    { source: 'jira', key: 'AOF-84', text: 'AOF-84 Engine switch' },
  ],
  items: {
    jira: [
      { key: 'AOF-84', text: 'AOF-84 Engine switch' },
      { key: 'AOF-85', text: 'AOF-85 Keystrokes' },
      { key: 'AOFX-1', text: 'AOFX-1 other project' },
    ],
  },
}

test('Jira key comes from the repo CLAUDE.md line', () => {
  expect(jiraKeyOf('# x\nJira: cloudId=4b42cf18-af4c key=AOF\n')).toBe('AOF')
  expect(jiraKeyOf('# graphify only')).toBe(undefined)
})

test('needs you and Jira keep only this project key, never calendar or other keys', () => {
  const [needs, jira] = paSections(CARDS, 'AOF')
  expect(needs!.rows).toEqual(['AOF-84 Engine switch'])
  expect(jira!.count).toBe(2)
  expect(jira!.rows).toEqual(['AOF-84 Engine switch', 'AOF-85 Keystrokes'])
})

test('no Jira line, PA down, or stale says so', () => {
  expect(paSections(CARDS, undefined)[1]!.note).toBe('no Jira for this project')
  expect(paSections(CARDS, undefined)[0]!.count).toBe(0)
  expect(paSections(null, 'AOF')[0]!.note).toBe('cards URL offline')
  expect(paSections({ ...CARDS, stale: true }, 'AOF')[1]!.note).toBe('stale')
})

test('todos: this project, open only, newest first, capped', () => {
  const todos = [
    { text: 'other', done: false, deletedAt: null, updatedAt: '2026-10-05', project: 'btc-ai-agent' },
    { text: 'done', done: true, deletedAt: null, updatedAt: '2026-10-01', project: 'me' },
    { text: 'gone', done: false, deletedAt: '2026-10-02', updatedAt: '2026-10-02', project: 'me' },
    ...Array.from({ length: 6 }, (_, i) => ({ text: `new${i}`, done: false, deletedAt: null, updatedAt: `2026-09-0${i}`, project: 'me' })),
  ]
  const s = todoSection({ todos }, 'me')
  expect(s.count).toBe(6)
  expect(s.rows.length).toBe(ROWS)
  expect(s.rows[0]).toBe('new5')
  expect(todoSection(null, 'me').note).toBe('todos URL offline')
})

test('agent board: counts by status, rows for live ones with elapsed time', () => {
  const list = [
    { id: 'a', description: 'Extract IG reel', type: 'general-purpose', status: 'running' },
    { id: 'b', description: '', type: 'Explore', status: 'waiting' },
    { id: 'c', description: 'old', type: 'Explore', status: 'completed' },
    { id: 'd', description: 'bad', type: 'Explore', status: 'failed' },
  ]
  const board = agentBoard(list, { a: 1_000, b: 60_000 }, 62_000)
  expect(board.counts).toEqual({ working: 1, waiting: 1, done: 1, stuck: 1 })
  expect(board.rows).toEqual([
    { label: 'Extract IG reel', status: 'running', elapsed: '1:01' },
    { label: 'Explore', status: 'waiting', elapsed: '0:02' },
  ])
  expect(clock(-5)).toBe('0:00')
})

test('topic is the first non-empty line, squashed', () => {
  expect(topicOf('\n\n  fix   the band  \nmore')).toBe('fix the band')
  expect(topicOf('')).toBe('')
})
