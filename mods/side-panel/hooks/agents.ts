// Pure logic: the session's agents and what their turn.step results report → header totals and one card each.
import type { Agent, AgentBoard, LoopUsage } from '../types'

type AgentLike = { id: string; description: string; type: string; status: string }
type StepUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
// When this mod first saw an agent and when it last saw it live (ms); a finished agent's span stops there.
export type Span = { from: number; to: number }

// The usage key of the main conversation (its steps carry no agentId).
export const MAIN = ''
// Live agent cards shown before "+N more".
export const CARDS = 4
export const WORKING = new Set(['running', 'pending'])
const WAITING = new Set(['waiting', 'idle'])
const DONE = new Set(['completed'])
const STUCK = new Set(['failed', 'killed'])
const isLive = (status: string) => WORKING.has(status) || WAITING.has(status)

// One step folded into its loop's total. `lastInput` is the step's input side, the base of ctx %.
export function addStep(all: Record<string, LoopUsage>, loop: string, model: string, effort: string, u: StepUsage | null | undefined): Record<string, LoopUsage> {
  if (!u) return all
  const input = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return { ...all, [loop]: { model, effort, tokens: (all[loop]?.tokens ?? 0) + input + (u.output_tokens ?? 0), lastInput: input } }
}

// Mutates `spans` like the poller's first-seen map: opens a span on first sight, extends it while live.
export function track(spans: Record<string, Span>, list: readonly AgentLike[], now: number) {
  for (const a of list) {
    const s = (spans[a.id] ??= { from: now, to: now })
    if (isLive(a.status)) s.to = now
  }
}

// Cost is the agent's share of the session's $ by tokens counted over every loop, main included: an estimate
// (a cache read weighs the same as an output token). ctx % only when the agent runs the session's model, the
// one window we know.
export function agentBoard(list: readonly AgentLike[], spans: Record<string, Span>, usage: Record<string, LoopUsage>, session: { usd: number; window: number }): AgentBoard {
  const all = Object.values(usage).reduce((n, u) => n + u.tokens, 0)
  const mainModel = usage[MAIN]?.model
  const card = (a: AgentLike): Agent => {
    const u = usage[a.id]
    const s = spans[a.id]
    const tokens = u?.tokens ?? 0
    const ctx = u && u.model === mainModel && session.window ? Math.round((100 * u.lastInput) / session.window) : undefined
    return { label: a.description || a.type, status: a.status, elapsed: clock(s ? s.to - s.from : 0), model: u?.model ?? '', effort: u?.effort ?? '', tokens, usd: all ? (session.usd * tokens) / all : 0, ...(ctx === undefined ? {} : { ctx }) }
  }
  const count = (set: Set<string>) => list.filter(a => set.has(a.status)).length
  const cards = list.map(card)
  const known = list.map(a => spans[a.id]).filter((s): s is Span => !!s)
  const time = known.length ? Math.max(...known.map(s => s.to)) - Math.min(...known.map(s => s.from)) : 0
  return {
    counts: { working: count(WORKING), waiting: count(WAITING), done: count(DONE), stuck: count(STUCK) },
    totals: { usd: cards.reduce((n, a) => n + a.usd, 0), tokens: cards.reduce((n, a) => n + a.tokens, 0), time: clock(time) },
    rows: cards.filter(a => isLive(a.status)),
    finished: cards.filter(a => !isLive(a.status)),
  }
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function tokensText(n: number) {
  if (n < 1_000) return `${n}`
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}
export const usdText = (n: number) => `≈$${n.toFixed(2)}`

// A card's second and third lines: "opus-5-5 · high" and "ctx 12% · 23.6k ≈$0.14 · 0:52".
export const metaLine = (a: Agent) => [a.model.replace(/^claude-/, '').replace(/\[.*\]$/, ''), a.effort].filter(Boolean).join(' · ')
export const statsLine = (a: Agent) => [a.ctx === undefined ? '' : `ctx ${a.ctx}%`, `${tokensText(a.tokens)} ${usdText(a.usd)}`, a.elapsed].filter(Boolean).join(' · ')
