// Pure drawing helpers: a stacked count bar (terminal cells or SVG pixels) and the desktop's SVG agent card.
import type { Agent, AgentCounts } from '../types'
import { WORKING } from './panel'

export const BAR = '━'
// Count bar parts, in order, with the theme color the terminal draws each in.
export const PARTS = [
  ['working', 'success'],
  ['waiting', 'warning'],
  ['done', 'subtle'],
  ['stuck', 'error'],
] as const

// Splits `width` cells across the parts by share; every non-zero part keeps at least one cell.
export function segments(parts: readonly number[], width: number): number[] {
  const total = parts.reduce((a, b) => a + b, 0)
  if (!total) return parts.map(() => 0)
  const cells = parts.map(p => (p ? Math.max(1, Math.round((p / total) * width)) : 0))
  // Rounding leaves the sum a cell or two off: settle it on the biggest part.
  const big = cells.indexOf(Math.max(...cells))
  cells[big] = Math.max(1, (cells[big] ?? 0) + width - cells.reduce((a, b) => a + b, 0))
  return cells
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const W = 320
const ROW = 22
// Light palette; the dark one swaps in when the desktop is dark.
const CSS = `.t{font:12px -apple-system,system-ui,sans-serif;fill:#1f2328}.d{fill:#6e7781}.track{fill:#d0d7de}
.working{fill:#1a7f37}.waiting{fill:#9a6700}.done{fill:#8c959f}.stuck{fill:#cf222e}
.pulse{animation:p 1.2s ease-in-out infinite}@keyframes p{50%{opacity:.25}}
@media (prefers-color-scheme:dark){.t{fill:#e6edf3}.d{fill:#8b949e}.track{fill:#30363d}
.working{fill:#3fb950}.waiting{fill:#d29922}.done{fill:#6e7681}.stuck{fill:#f85149}}`

// The Agents card on desktop: the count bar, then one row per live agent (a pulsing dot while it works).
export function agentSvg(counts: AgentCounts, rows: readonly Agent[]): string {
  const widths = segments(PARTS.map(([k]) => counts[k]), W)
  let x = 0
  const bar = PARTS.map(([k], i) => {
    const w = widths[i] ?? 0
    const r = w ? `<rect class="${k}" x="${x}" width="${w}" height="8"/>` : ''
    x += w
    return r
  }).join('')
  const lines = rows.length
    ? rows.map((a, i) => {
        const y = 32 + i * ROW
        const kind = WORKING.has(a.status) ? 'working pulse' : 'waiting'
        return `<circle class="${kind}" cx="5" cy="${y - 4}" r="4"/><text class="t" x="16" y="${y}">${esc(cut(a.label, 44))}</text>` +
          `<text class="t d" x="${W}" y="${y}" text-anchor="end">${esc(`${a.status} ${a.elapsed}`)}</text>`
      })
    : ['<text class="t d" x="0" y="32">none running</text>']
  const h = 32 + Math.max(rows.length, 1) * ROW - 12
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}"><style>${CSS}</style>` +
    `<clipPath id="c"><rect width="${W}" height="8" rx="4"/></clipPath><rect class="track" width="${W}" height="8" rx="4"/>` +
    `<g clip-path="url(#c)">${bar}</g>${lines.join('')}</svg>`
}
