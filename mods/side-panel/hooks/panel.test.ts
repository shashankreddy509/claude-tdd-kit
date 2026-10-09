import { expect, test } from 'claude-code/testing'

import { JIRA_ROWS, ROWS, isProjectSearch, issuesOf, jiraKeyOf, jiraSection, needsSection, savedPathOf, todoSection, topicOf } from './panel'

// Payload shapes sampled from real cards/todos servers on 2026-10-07.
const CARDS = {
  stale: false,
  needs_you: [
    { source: 'jira', key: 'XYZ-222', text: 'XYZ-222 [HIGH] delivery_channels' },
    { source: 'calendar', key: 'cal-1', text: 'Dentist 3pm' },
    { source: 'jira', key: 'ABC-84', text: 'ABC-84 Engine switch' },
    { source: 'jira', key: 'ABCX-5', text: 'ABCX-5 prefix lookalike' },
  ],
}

test('Jira key comes from the repo CLAUDE.md line', () => {
  expect(jiraKeyOf('# x\nJira: cloudId=00000000-0000 key=ABC\n')).toBe('ABC')
  expect(jiraKeyOf('# graphify only')).toBe(undefined)
})

test('needs you keeps only this project key, never calendar or other keys', () => {
  expect(needsSection(CARDS, 'ABC').rows).toEqual(['ABC-84 Engine switch'])
})

test('needs you: no Jira line, cards down, or stale says so', () => {
  expect(needsSection(CARDS, undefined).note).toBe('no Jira for this project')
  expect(needsSection(CARDS, undefined).count).toBe(0)
  expect(needsSection(null, 'ABC').note).toBe('cards URL offline')
  expect(needsSection({ ...CARDS, stale: true }, 'ABC').note).toBe('stale')
})

// The Jira MCP search tool's text, shape sampled from a real searchJiraIssuesUsingJql call on 2026-10-07.
const issue = (key: string, status: string, summary = key) => ({ key, fields: { summary, status: { name: status } } })
const SEARCH = JSON.stringify({
  issues: [issue('PROJ-19', 'Build Testing', 'pop-ups P1'), issue('PROJ-52', 'In Progress'), issue('PROJ-101', 'To Do'), issue('ABC-84', 'To Do'), issue('PROJX-7', 'To Do'), issue('PROJ-109', 'To Do')],
  isLast: true,
})

test('only start-session\'s own search replaces the Jira card', () => {
  expect(isProjectSearch('project = PROJ AND statusCategory != Done ORDER BY status ASC, created DESC', 'PROJ')).toBe(true)
  expect(isProjectSearch('project="PROJ"  and statusCategory!=Done', 'PROJ')).toBe(true)
  expect(isProjectSearch('project = PROJ AND statusCategory != Done AND issuetype != Epic AND parent is not EMPTY', 'PROJ')).toBe(false)
  expect(isProjectSearch('key in (PROJ-68, ABC-90) OR project in (PROJ, ABC)', 'PROJ')).toBe(false)
  expect(isProjectSearch('project = PROJX AND statusCategory != Done', 'PROJ')).toBe(false)
})

// Seen live 2026-10-07: a 57k-char result reached the hook as this note, with the JSON in the file.
test('a too-big result points at the file it was saved to', () => {
  const note = 'Error: result (57,684 characters) exceeds maximum allowed tokens. Output has been saved to /Users/me/.claude/projects/x/tool-results/mcp-atlassian-searchJiraIssuesUsingJql-1791412093761.txt.\nFormat: JSON'
  expect(savedPathOf(note)).toBe('/Users/me/.claude/projects/x/tool-results/mcp-atlassian-searchJiraIssuesUsingJql-1791412093761.txt')
  expect(savedPathOf(SEARCH)).toBe(undefined)
})

test('both Jira MCP dialects read the same: issues list or issues.nodes', () => {
  const nodes = JSON.stringify({ issues: { nodes: JSON.parse(SEARCH).issues, pageInfo: { hasNextPage: false } } })
  expect(issuesOf(nodes)).toEqual(issuesOf(SEARCH))
  expect(jiraSection(issuesOf(nodes), 'PROJ').count).toBe(4)
})

test('Jira card: this project only, started work first, To Do last, count is tickets', () => {
  // Real searches return To Do first (43 of 45 on 2026-10-07), which buried the active tickets.
  const todoFirst = JSON.stringify({ issues: [...JSON.parse(SEARCH).issues].reverse() })
  const s = jiraSection(issuesOf(todoFirst), 'PROJ')
  expect(s.count).toBe(4)
  expect(s.note).toBe(undefined)
  expect(s.rows).toEqual(['▸ In Progress (1)', 'PROJ-52 PROJ-52', '▸ Build Testing (1)', 'PROJ-19 pop-ups P1', '▸ To Do (2)', 'PROJ-109 PROJ-109', 'PROJ-101 PROJ-101'])
})

test('Jira card: long lists end in a more line', () => {
  const many = JSON.stringify({ issues: Array.from({ length: 30 }, (_, i) => issue(`PROJ-${i}`, 'To Do')) })
  const s = jiraSection(issuesOf(many), 'PROJ')
  expect(s.count).toBe(30)
  expect(s.rows.length).toBe(JIRA_ROWS)
  expect(s.rows[JIRA_ROWS - 1]).toBe('… +17 more')
})

test('Jira card: not fetched yet, or a failed search says so', () => {
  expect(jiraSection('waiting', 'PROJ').note).toBe('waiting for start-session')
  expect(jiraSection(issuesOf('Error: 401 Unauthorized'), 'PROJ').note).toBe('Jira unavailable')
  expect(jiraSection(issuesOf(undefined), 'PROJ').note).toBe('Jira unavailable')
  expect(jiraSection(issuesOf('{"errorMessages":["bad JQL"]}'), 'PROJ').note).toBe('Jira unavailable')
})

test('todos: this project, open only, newest first, capped', () => {
  const todos = [
    { text: 'other', done: false, deletedAt: null, updatedAt: '2026-10-05', project: 'other-repo' },
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

test('topic is the first non-empty line, squashed', () => {
  expect(topicOf('\n\n  fix   the band  \nmore')).toBe('fix the band')
  expect(topicOf('')).toBe('')
  for (const answer of ['1 Now', '1 yes 2 no 3 Different', '1 yes 3 PROJ-91', 'yes to all', '<ci-monitor-event>"Auto-fix" was enabled</ci-monitor-event>']) expect(topicOf(answer)).toBe('')
  expect(topicOf('<b> bold the header')).toBe('<b> bold the header')
  expect(topicOf('1 more thing: fix the band')).toBe('1 more thing: fix the band')
})
