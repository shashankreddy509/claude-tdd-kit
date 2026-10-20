// Pure logic: the session's agents (agent.spawn records, $.agent.list() statuses, turn.step usage) → one row each.
import type { Agent, LoopUsage, Spawn } from '../types'

type Listed = { id: string; description: string; type: string; status: string; parentId?: string }
type StepUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

// The usage key of the main conversation (its steps carry no agentId).
export const MAIN = ''
export const WORKING = new Set(['running', 'pending'])
const LIVE = new Set([...WORKING, 'waiting', 'idle'])
export const isLive = (status: string) => LIVE.has(status)
// A background agent that handed back stays 'waiting' in list() (resumable) though its work is done; a later
// tool call overwrites `doing` and makes it live again.
const handedBack = (doing: Record<string, string>, id: string) => doing[id] === 'SubagentHandback'

// One step folded into its loop's total.
export function addStep(all: Record<string, LoopUsage>, loop: string, model: string, effort: string, u: StepUsage | null | undefined): Record<string, LoopUsage> {
  if (!u) return all
  const input = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return { ...all, [loop]: { model, effort, tokens: (all[loop]?.tokens ?? 0) + input + (u.output_tokens ?? 0) } }
}

// The poll's view folded into the spawn records: an agent the spawn hook never saw (spawned before a reload) is
// added at first sight, and every live one that has not handed back is stamped seen now.
export function seen(spawns: Record<string, Spawn>, list: readonly Listed[], now: number, doing: Record<string, string> = {}): Record<string, Spawn> {
  const out = { ...spawns }
  for (const a of list) {
    const s = out[a.id] ?? { id: a.id, type: a.type, description: a.description, model: '', from: now, ...(a.parentId ? { parent: a.parentId } : {}) }
    out[a.id] = isLive(a.status) && !handedBack(doing, a.id) ? { ...s, to: now } : s
  }
  return out
}

// Every agent this session spawned, oldest first. Status comes from the poll; one gone from it has finished
// (seen live 2026-10-13: a foreground agent leaves list() without ever showing 'completed'). Cost is the agent's
// share of the session's $ by tokens counted over every loop, main included: an estimate.
export function agentBoard(spawns: Record<string, Spawn>, list: readonly Listed[], usage: Record<string, LoopUsage>, doing: Record<string, string>, usd: number, now: number): Agent[] {
  const all = Object.values(usage).reduce((n, u) => n + u.tokens, 0)
  const status = new Map(list.map(a => [a.id, a.status]))
  return Object.values(spawns)
    .sort((a, b) => a.from - b.from)
    .map(s => {
      const st = handedBack(doing, s.id) ? 'completed' : (status.get(s.id) ?? 'completed')
      const live = isLive(st)
      const u = usage[s.id]
      const tokens = u?.tokens ?? 0
      return { ...s, status: st, elapsed: clock((live ? now : (s.to ?? s.from)) - s.from), model: u?.model ?? s.model, effort: u?.effort ?? '', tokens, usd: all ? (usd * tokens) / all : 0, ...(live && doing[s.id] ? { now: doing[s.id] } : {}) }
    })
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const usdText = (n: number) => `≈$${n.toFixed(2)}`

// '[1m]'-style suffixes name a context window, not a different model.
export const baseModel = (m: string) => m.replace(/\[.*\]$/, '')
// "claude-opus-5-5[1m]" → "opus-5-5": the header's model and each agent row's.
export const modelText = (m: string) => baseModel(m).replace(/^claude-/, '')
// An agent row's dim line: "opus-5-5 · high".
export const metaLine = (a: { model: string; effort: string }) => [modelText(a.model), a.effort].filter(Boolean).join(' · ')

// "Edit WordCounterTest.kt": the tool a helper is running and the file (or the command's first word) it is on.
export function nowText(tool: string, input: Record<string, unknown>): string {
  const arg = [input.file_path, input.path, input.pattern, input.command].find(v => typeof v === 'string' && v) as string | undefined
  const short = arg === input.command ? arg?.split(/\s+/)[0] : arg?.split('/').pop()
  return [tool, short].filter(Boolean).join(' ')
}
