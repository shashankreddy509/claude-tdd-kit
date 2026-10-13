// Look B: a TDD build drawn as stages (the rail) over a tree of who spawned whom; any other agents are a plain tree.
// Types are the live `<plugin>:<name>` strings (probed 2026-10-13, Claude Code 2.1.296); Explore has no prefix.
import type { Agent } from '../types'
import { isLive, usdText } from './agents'

const STAGES = ['explore', 'tests', 'code', 'run', 'review'] as const
type Stage = (typeof STAGES)[number]
const KIT = 'tdd-pipeline:'
const REVIEWERS = ['code-review-coordinator', 'security-reviewer', 'code-quality-reviewer', 'memory-analyzer', 'money-logic-reviewer', 'concurrency-reviewer', 'kotlin-best-practices']
// The fixed stage map (owner ruled 2026-10-13: keyed on the full type). build-coordinator and changelog have no stage.
export const STAGE: Record<string, Stage> = {
  Explore: 'explore',
  [`${KIT}planner`]: 'explore',
  [`${KIT}test-writer`]: 'tests',
  [`${KIT}implementer`]: 'code',
  [`${KIT}test-runner`]: 'run',
  ...Object.fromEntries(REVIEWERS.map(r => [`${KIT}${r}`, 'review'])),
}

// The newest live top-level kit agent (a build-coordinator, or the planner before one starts): the rail's build.
export const buildOf = (agents: readonly Agent[]) => agents.filter(a => !a.parent && isLive(a.status) && a.type.startsWith(KIT)).pop()

type RailStage = { stage: Stage; label: string; state: 'done' | 'now' | 'todo' }
function stateOf(i: number, at: number): RailStage['state'] {
  if (i < at) return 'done'
  return i === at ? 'now' : 'todo'
}
// The newest staged agent in the build marks the stage it is at, the ones before are done. Each test-runner
// spawn is one round, so the fix loop shows as "run r2" (owner ruled 2026-10-13).
export function rail(build: readonly Agent[]): RailStage[] {
  const at = STAGES.indexOf(build.map(a => STAGE[a.type]).filter(Boolean).pop() as Stage)
  const runs = build.filter(a => a.type === `${KIT}test-runner`).length
  return STAGES.map((stage, i) => ({
    stage,
    label: stage === 'run' && runs > 1 ? `run r${runs}` : stage,
    state: stateOf(i, at),
  }))
}

type TreeRow = { agent: Agent; lead: string; pad: string }
// Depth-first rows under `tops`, oldest first: `lead` prefixes the name line ("├─ "), `pad` the lines below it.
export function tree(agents: readonly Agent[], tops: readonly Agent[]): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (a: Agent, lead: string, pad: string) => {
    rows.push({ agent: a, lead, pad })
    const kids = agents.filter(k => k.parent === a.id)
    kids.forEach((k, i) => {
      const last = i === kids.length - 1
      walk(k, `${pad}${last ? '└─ ' : '├─ '}`, `${pad}${last ? '   ' : '│  '}`)
    })
  }
  for (const t of tops) walk(t, '', '')
  return rows
}

// What the Agents card draws: the build (if any) with its rail, then every other live top-level agent as a tree.
// A build's agents are its tree: every agent whose parentAgentId chain reaches it, reviewers (grandchildren) included.
export function agentsLook(agents: readonly Agent[]) {
  const build = buildOf(agents)
  const others = agents.filter(a => !a.parent && a !== build && isLive(a.status))
  const rows = tree(agents, build ? [build, ...others] : others)
  const shown = rows.map(r => r.agent)
  const inBuild = new Set(build ? tree(agents, [build]).map(r => r.agent) : [])
  const usd = usdText(shown.reduce((n, a) => n + a.usd, 0))
  const key = build?.description.match(/[A-Z][A-Z0-9]+-\d+/)?.[0]
  const title = build ? [key, build.elapsed, usd] : [`${shown.filter(a => isLive(a.status)).length} running`, usd]
  return {
    title: shown.length ? title.filter(Boolean).join(' · ') : '',
    stages: build ? rail(agents.filter(a => inBuild.has(a))) : [],
    rows,
  }
}

// A row's chip in the terminal, where emoji garble: "build-coordinator" → "BC", "Explore" → "EX".
export function initials(type: string): string {
  const name = type.slice(type.indexOf(':') + 1)
  const words = name.split('-')
  return (words.length > 1 ? words.map(w => w[0]).join('') : name).slice(0, 2).toUpperCase()
}

// The name a row shows: the agent's type without its plugin.
export const shortType = (type: string) => type.slice(type.indexOf(':') + 1)
