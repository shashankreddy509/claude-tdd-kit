import { expect, test } from 'claude-code/testing'

import { JIRA_ROWS, ROWS, agentBoard, clock, isProjectSearch, issuesOf, jiraKeyOf, jiraSection, needsSection, todoSection, topicOf } from './panel'

// Payload shapes sampled from real cards/todos servers on 2026-10-07.
const CARDS = {
  stale: false,
  needs_you: [
    { source: 'jira', key: 'BTCWEB-222', text: 'BTCWEB-222 [HIGH] delivery_channels' },
    { source: 'calendar', key: 'cal-1', text: 'Dentist 3pm' },
    { source: 'jira', key: 'AOF-84', text: 'AOF-84 Engine switch' },
  ],
}

test('Jira key comes from the repo CLAUDE.md line', () => {
  expect(jiraKeyOf('# x\nJira: cloudId=4b42cf18-af4c key=AOF\n')).toBe('AOF')
  expect(jiraKeyOf('# graphify only')).toBe(undefined)
})

test('needs you keeps only this project key, never calendar or other keys', () => {
  expect(needsSection(CARDS, 'AOF').rows).toEqual(['AOF-84 Engine switch'])
})

test('needs you: no Jira line, PA down, or stale says so', () => {
  expect(needsSection(CARDS, undefined).note).toBe('no Jira for this project')
  expect(needsSection(CARDS, undefined).count).toBe(0)
  expect(needsSection(null, 'AOF').note).toBe('cards URL offline')
  expect(needsSection({ ...CARDS, stale: true }, 'AOF').note).toBe('stale')
})

// The Jira MCP search tool's text, shape sampled from a real searchJiraIssuesUsingJql call on 2026-10-07.
const issue = (key: string, status: string, summary = key) => ({ key, fields: { summary, status: { name: status } } })
const SEARCH = JSON.stringify({
  issues: [issue('PA-19', 'Build Testing', 'pop-ups P1'), issue('PA-52', 'In Progress'), issue('PA-101', 'To Do'), issue('AOF-84', 'To Do'), issue('PA-109', 'To Do')],
  isLast: true,
})

test('only a whole-project search replaces the Jira card', () => {
  expect(isProjectSearch('project = PA AND statusCategory != Done ORDER BY status ASC', 'PA')).toBe(true)
  expect(isProjectSearch('project="PA" AND type = Bug', 'PA')).toBe(true)
  expect(isProjectSearch('key in (PA-68, AOF-90) OR project in (PA, AOF)', 'PA')).toBe(false)
  expect(isProjectSearch('project = PAX', 'PA')).toBe(false)
})

test('Jira card: this project only, grouped by status in search order, count is tickets', () => {
  const s = jiraSection(issuesOf(SEARCH), 'PA')
  expect(s.count).toBe(4)
  expect(s.note).toBe(undefined)
  expect(s.rows).toEqual(['▸ Build Testing (1)', 'PA-19 pop-ups P1', '▸ In Progress (1)', 'PA-52 PA-52', '▸ To Do (2)', 'PA-101 PA-101', 'PA-109 PA-109'])
})

test('Jira card: long lists end in a more line', () => {
  const many = JSON.stringify({ issues: Array.from({ length: 30 }, (_, i) => issue(`PA-${i}`, 'To Do')) })
  const s = jiraSection(issuesOf(many), 'PA')
  expect(s.count).toBe(30)
  expect(s.rows.length).toBe(JIRA_ROWS)
  expect(s.rows[JIRA_ROWS - 1]).toBe('… +17 more')
})

test('Jira card: no Jira line, not fetched yet, or a failed search says so', () => {
  expect(jiraSection(issuesOf(SEARCH), undefined).note).toBe('no Jira for this project')
  expect(jiraSection('waiting', 'PA').note).toBe('waiting for start-session')
  expect(jiraSection(issuesOf('Error: 401 Unauthorized'), 'PA').note).toBe('Jira unavailable')
  expect(jiraSection(issuesOf(undefined), 'PA').note).toBe('Jira unavailable')
  expect(jiraSection(issuesOf('{"errorMessages":["bad JQL"]}'), 'PA').note).toBe('Jira unavailable')
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
