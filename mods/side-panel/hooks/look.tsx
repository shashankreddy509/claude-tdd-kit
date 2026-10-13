// Small drawing pieces the pane, the Cache card and the Agents card share.
import type { Elements, RenderSurface } from 'claude-code'

export type Ui = Elements[RenderSurface]
export type Dot = 'working' | 'waiting' | 'done' | 'stuck'

// Light palette; the dark one swaps in when the desktop is dark.
const CSS = `.working{fill:#1a7f37}.waiting{fill:#9a6700}.done{fill:#8c959f}.stuck{fill:#cf222e}
.pulse{animation:p 1.2s ease-in-out infinite}@keyframes p{50%{opacity:.25}}
@media (prefers-color-scheme:dark){.working{fill:#3fb950}.waiting{fill:#d29922}.done{fill:#6e7681}.stuck{fill:#f85149}}`

// A 10px status dot for a desktop agent row: pulsing green while it works.
export function dotSvg(dot: Dot): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><style>${CSS}</style>` +
    `<circle class="${dot === 'working' ? 'working pulse' : dot}" cx="5" cy="5" r="4"/></svg>`
}

// The desktop's Svg element, or none in the terminal: its table is padded with every element name, so
// `'Svg' in ui` alone is true there too; the surface decides.
export const svgOf = (ui: Ui, surface: RenderSurface) => (surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined)

// A background chip: " live ", " running ", " BC ".
export const chip = (ui: Ui, text: string, color: string) => (
  <ui.Text backgroundColor={color} color="inverseText">{` ${text} `}</ui.Text>
)

// One line that never wraps.
export const line = (ui: Ui, text: string, key: string, dim = false) => (
  <ui.Text key={key} wrap="truncate-end" dimColor={dim}>
    {text}
  </ui.Text>
)
