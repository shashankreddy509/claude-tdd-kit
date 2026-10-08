export type Tone = 'success' | 'warning' | 'error'
export type CacheState = { warm: boolean; msLeft: number; shouldWarn: boolean; left: number; tone: Tone }

// Warm until lastAt + ttl. The warning lead is ttl/5 capped at 5 min
// (60m -> 5m, 5m -> 1m, 2m -> 24s), raised once per lastAt. `left` is the share of the ttl still warm;
// `tone` is the theme color: success while warm, warning inside the lead, error once cold.
export function cacheState(lastAt: number | null, now: number, ttlMs: number, warnedFor: number | null): CacheState | null {
  if (lastAt === null) return null
  const msLeft = Math.max(0, lastAt + ttlMs - now)
  const lead = Math.min(5 * 60_000, ttlMs / 5)
  let tone: Tone = 'success'
  if (msLeft === 0) tone = 'error'
  else if (msLeft <= lead) tone = 'warning'
  return { warm: msLeft > 0, msLeft, shouldWarn: tone === 'warning' && warnedFor !== lastAt, left: Math.min(1, msLeft / ttlMs), tone }
}

// Cells of a `width`-cell bar to fill for share `left`; any warmth left shows at least one cell.
export const filled = (left: number, width: number) => (left > 0 ? Math.max(1, Math.round(left * width)) : 0)

// The desktop's draining warmth bar: a rounded track filled by `left`, light and dark palettes.
const HEX: Record<Tone, [string, string]> = { success: ['#1a7f37', '#3fb950'], warning: ['#9a6700', '#d29922'], error: ['#cf222e', '#f85149'] }
export function warmthSvg(left: number, tone: Tone): string {
  const [light, dark] = HEX[tone]
  const w = filled(left, 120)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="8" viewBox="0 0 120 8"><style>.k{fill:#d0d7de}.f{fill:${light}}` +
    `@media (prefers-color-scheme:dark){.k{fill:#30363d}.f{fill:${dark}}}</style><clipPath id="c"><rect width="120" height="8" rx="4"/></clipPath>` +
    `<rect class="k" width="120" height="8" rx="4"/><rect class="f" width="${w}" height="8" clip-path="url(#c)"/></svg>`
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
