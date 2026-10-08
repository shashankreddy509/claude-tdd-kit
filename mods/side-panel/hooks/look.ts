// Pure drawing helpers: a stacked count bar (terminal cells or SVG pixels) and the desktop's status dot.
import type { AgentCounts } from '../types'

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

const W = 320
// Light palette; the dark one swaps in when the desktop is dark.
const CSS = `.track{fill:#d0d7de}.working{fill:#1a7f37}.waiting{fill:#9a6700}.done{fill:#8c959f}.stuck{fill:#cf222e}
.pulse{animation:p 1.2s ease-in-out infinite}@keyframes p{50%{opacity:.25}}
@media (prefers-color-scheme:dark){.track{fill:#30363d}.working{fill:#3fb950}.waiting{fill:#d29922}.done{fill:#6e7681}.stuck{fill:#f85149}}`

// The desktop's count bar. It stretches to the card's width on purpose (preserveAspectRatio none): a bar reads
// right at any width, which is why the agent rows stay text and only shapes are SVG.
export function barSvg(counts: AgentCounts): string {
  const widths = segments(PARTS.map(([k]) => counts[k]), W)
  let x = 0
  const bar = PARTS.map(([k], i) => {
    const w = widths[i] ?? 0
    const r = w ? `<rect class="${k}" x="${x}" width="${w}" height="8"/>` : ''
    x += w
    return r
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 8" preserveAspectRatio="none"><style>${CSS}</style>` +
    `<clipPath id="c"><rect width="${W}" height="8" rx="4"/></clipPath><rect class="track" width="${W}" height="8" rx="4"/>` +
    `<g clip-path="url(#c)">${bar}</g></svg>`
}

// A 10px status dot for an agent row: pulsing green while it works, amber while it waits.
export function dotSvg(working: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><style>${CSS}</style>` +
    `<circle class="${working ? 'working pulse' : 'waiting'}" cx="5" cy="5" r="4"/></svg>`
}
