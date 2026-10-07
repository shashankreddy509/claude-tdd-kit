// Pure logic: local server payloads and the agent list → dashboard sections for the OPEN project only.
import type { Agent, AgentCounts, Section } from '../types'

export const ROWS = 4

type Card = { source?: string; key?: string; text?: string }
type Cards = { needs_you?: Card[]; items?: { jira?: Card[] }; stale?: boolean }
type Todo = { text?: string; done?: boolean; deletedAt?: string | null; updatedAt?: string; project?: string }
type AgentLike = { id: string; description: string; type: string; status: string }

const offline = (title: string, what: string): Section => ({ title, count: 0, rows: [], note: `${what} offline` })
const section = (title: string, rows: string[], note?: string): Section => ({ title, count: rows.length, rows: rows.slice(0, ROWS), note })

// The repo's CLAUDE.md names its Jira project as `Jira: cloudId=<uuid> key=<KEY>`.
export const jiraKeyOf = (claudeMd: string) => /Jira:\s*cloudId=\S+\s+key=([A-Z][A-Z0-9]*)/.exec(claudeMd)?.[1]

// Cards-source items, kept to this project's Jira key: ranked needs_you, then every open ticket.
export function paSections(cards: Cards | null, key: string | undefined): Section[] {
  if (!cards?.needs_you) return [offline('Needs you', 'cards URL'), offline('Jira', 'cards URL')]
  if (!key) return [section('Needs you', [], 'no Jira for this project'), section('Jira', [], 'no Jira for this project')]
  const note = cards.stale ? 'stale' : undefined
  const mine = (list: Card[] = []) => list.filter(c => c.key?.startsWith(`${key}-`)).map(c => c.text ?? '')
  return [section('Needs you', mine(cards.needs_you), note), section('Jira', mine(cards.items?.jira), note)]
}

// The todos source keeps done and soft-deleted rows; show this project's newest open ones.
export function todoSection(payload: { todos?: Todo[] } | null, project: string): Section {
  if (!payload?.todos) return offline('Todos', 'todos URL')
  const open = payload.todos
    .filter(t => !t.done && !t.deletedAt && t.project === project)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  return section('Todos', open.map(t => t.text ?? ''))
}

const WORKING = new Set(['running', 'pending'])
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

export const topicOf = (prompt: string) => prompt.split('\n').map(l => l.trim()).find(Boolean)?.replace(/\s+/g, ' ') ?? ''
