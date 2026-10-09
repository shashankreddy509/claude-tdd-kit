// Pure logic: local server payloads and the agent list → dashboard sections for the OPEN project only.
import type { Agent, AgentCounts, JiraIssue, JiraState, Section } from '../types'

export const ROWS = 4
export const JIRA_ROWS = 15

type Card = { source?: string; key?: string; text?: string }
type Cards = { needs_you?: Card[]; stale?: boolean }
type Todo = { text?: string; done?: boolean; deletedAt?: string | null; updatedAt?: string; project?: string }
type AgentLike = { id: string; description: string; type: string; status: string }

const offline = (title: string, what: string): Section => ({ title, count: 0, rows: [], note: `${what} offline` })
const section = (title: string, rows: string[], note?: string): Section => ({ title, count: rows.length, rows: rows.slice(0, ROWS), note })

// The repo's CLAUDE.md names its Jira project as `Jira: cloudId=<uuid> key=<KEY>`.
export const jiraKeyOf = (claudeMd: string) => /Jira:\s*cloudId=\S+\s+key=([A-Z][A-Z0-9]*)/.exec(claudeMd)?.[1]

// Cards-source needs_you, kept to this project's Jira key.
export function needsSection(cards: Cards | null, key: string | undefined): Section {
  if (!cards?.needs_you) return offline('Needs you', 'cards URL')
  if (!key) return section('Needs you', [], 'no Jira for this project')
  const mine = cards.needs_you.filter(c => c.key?.startsWith(`${key}-`)).map(c => c.text ?? '')
  return section('Needs you', mine, cards.stale ? 'stale' : undefined)
}

// Only start-session's own search (`project = KEY AND statusCategory != Done`, any ORDER BY) replaces
// the card; any narrower or cross-project search would show a partial list.
export function isProjectSearch(jql: string, key: string): boolean {
  const where = jql.replace(/\s+order\s+by[\s\S]*$/i, '').replace(/["']/g, '').replace(/\s+/g, ' ').trim()
  return new RegExp(`^project ?= ?${key} and statusCategory ?!= ?Done$`, 'i').test(where)
}

// A result too big for the model is replaced by a note naming the file it was saved to.
export const savedPathOf = (text: string | undefined) => /saved to (\/\S+?\.(?:txt|json))/.exec(text ?? '')?.[1]

// The Jira search tool's JSON → slim issues; the MCP returns `issues: [...]` or `issues: { nodes: [...] }`
// depending on the machine. 'unavailable' when it is neither.
export function issuesOf(text: string | undefined): JiraState {
  try {
    const found = JSON.parse(text ?? '').issues
    const issues = Array.isArray(found) ? found : found?.nodes
    if (!Array.isArray(issues)) return 'unavailable'
    return issues.map((i: { key?: string; fields?: { summary?: string; status?: { name?: string } } }) => ({
      key: i.key ?? '',
      summary: i.fields?.summary ?? '',
      status: i.fields?.status?.name ?? '?',
    }))
  } catch {
    return 'unavailable'
  }
}

const notStarted = (status: string) => /^(to do|backlog|product backlog)$/i.test(status)

// This project's tickets under a header per status: started work first, To Do / Backlog last,
// otherwise in the order the search returned them (a 15-line card must not bury the 2 active ones).
export function jiraSection(state: JiraState, key: string): Section {
  if (state === 'waiting') return section('Jira', [], 'waiting for start-session')
  if (state === 'unavailable') return section('Jira', [], 'Jira unavailable')
  const groups = new Map<string, JiraIssue[]>()
  for (const i of state.filter(i => i.key.startsWith(`${key}-`))) groups.set(i.status, [...(groups.get(i.status) ?? []), i])
  const ordered = [...groups].sort(([a], [b]) => Number(notStarted(a)) - Number(notStarted(b)))
  const rows = ordered.flatMap(([status, list]) => [`▸ ${status} (${list.length})`, ...list.map(i => `${i.key} ${i.summary}`)])
  const count = rows.length - groups.size
  if (rows.length <= JIRA_ROWS) return { title: 'Jira', count, rows }
  const shown = rows.slice(0, JIRA_ROWS - 1)
  return { title: 'Jira', count, rows: [...shown, `… +${rows.length - shown.length} more`] }
}

// The todos source keeps done and soft-deleted rows; show this project's newest open ones.
export function todoSection(payload: { todos?: Todo[] } | null, project: string): Section {
  if (!payload?.todos) return offline('Todos', 'todos URL')
  const open = payload.todos
    .filter(t => !t.done && !t.deletedAt && t.project === project)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  return section('Todos', open.map(t => t.text ?? ''))
}

export const WORKING = new Set(['running', 'pending'])
const WAITING = new Set(['waiting', 'idle'])
const DONE = new Set(['completed'])
const STUCK = new Set(['failed', 'killed'])

// The session's agents as the reel's dock shows them: counts, and a row with elapsed time per live one.
// `seen` maps an agent id to when this mod first saw it (ms); `now` is the clock in ms.
export function agentBoard(list: readonly AgentLike[], seen: Record<string, number>, now: number): { counts: AgentCounts; rows: Agent[] } {
  const count = (set: Set<string>) => list.filter(a => set.has(a.status)).length
  const rows = list
    .filter(a => WORKING.has(a.status) || WAITING.has(a.status))
    .map(a => ({ label: a.description || a.type, status: a.status, elapsed: clock(now - (seen[a.id] ?? now)) }))
  return { counts: { working: count(WORKING), waiting: count(WAITING), done: count(DONE), stuck: count(STUCK) }, rows }
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// A reply made only of numbered answers ("1 yes 2 no", "1 Now", "1 yes 3 PROJ-91") or "yes to all" is not a
// topic: '' keeps the previous one on the card.
const ANSWER = /^(?:(?:\d+\s+[\w-]+\s*)+|yes to all)$/i
export function topicOf(prompt: string): string {
  const first = prompt.split('\n').map(l => l.trim()).find(Boolean)?.replace(/\s+/g, ' ') ?? ''
  return ANSWER.test(first) ? '' : first
}
