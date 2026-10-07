export type CacheState = { warm: boolean; msLeft: number; shouldWarn: boolean }

// Warm until lastAt + ttl. The warning lead is ttl/5 capped at 5 min
// (60m -> 5m, 5m -> 1m, 2m -> 24s), raised once per lastAt.
export function cacheState(lastAt: number | null, now: number, ttlMs: number, warnedFor: number | null): CacheState | null {
  if (lastAt === null) return null
  const msLeft = Math.max(0, lastAt + ttlMs - now)
  const lead = Math.min(5 * 60_000, ttlMs / 5)
  return { warm: msLeft > 0, msLeft, shouldWarn: msLeft > 0 && msLeft <= lead && warnedFor !== lastAt }
}

export const kTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

// What fills the context, biggest first (the /context breakdown's used rows); the biggest row the owner
// can actually cut (skills, MCP tools, memory files, custom agents) at 10k+ gets a "← trim" hint.
const TRIMMABLE = /skill|mcp|memory|agent/i
type ContextRow = { name: string; tokens: number; kind: string }
export function eatingText(rows: readonly ContextRow[], top = 4): string {
  const used = rows.filter(r => r.kind === 'used' && r.tokens > 0).sort((a, b) => b.tokens - a.tokens).slice(0, top)
  const trim = used.find(r => TRIMMABLE.test(r.name) && r.tokens >= 10_000)
  return used.map(r => `${r.name.toLowerCase()} ${kTokens(r.tokens)}${r === trim ? ' ← trim' : ''}`).join(' · ')
}
