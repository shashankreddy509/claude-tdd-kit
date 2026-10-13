export type Section = { title: string; count: number; rows: string[]; note?: string }
// One agent as agent.spawn reported it (`parent` = its parentAgentId; absent when main spawned it). `to` is when
// it was last seen live; `from` its spawn.
export type Spawn = { id: string; type: string; parent?: string; description: string; model: string; from: number; to?: number }
// One agent row: its spawn, status from $.agent.list() ('completed' once gone), and what its steps reported.
// `now` is the tool it is running, while live.
export type Agent = Spawn & { status: string; elapsed: string; effort: string; tokens: number; usd: number; now?: string }
// Per loop ('' = the main conversation): what its turn.step results report.
export type LoopUsage = { model: string; effort: string; tokens: number }
export type Undone = { text: string }
export type JiraIssue = { key: string; summary: string; status: string }
// 'waiting' until a project-wide Jira search runs this session; 'unavailable' when it failed.
export type JiraState = 'waiting' | 'unavailable' | JiraIssue[]
// One Ship band item: a ship.md step 0 row's verdict; `muted` is a check the band cannot run (left to /ship).
export type ShipItem = { level: 'ok' | 'warn' | 'stop' | 'muted'; text: string }
// The receipt the band shows (key = its file name), or null when the repo has none.
export type Ship = { key: string; items: ShipItem[] }
// The open repo's branch (absent when detached or not a repo) and whether `.git` is a worktree's file.
export type Head = { branch?: string; worktree: boolean }

declare module 'claude-code' {
  interface PluginState {
    'side-panel': {
      sections: Section[]
      agents: Agent[]
      spawns: Record<string, Spawn>
      doing: Record<string, string>
      usage: Record<string, LoopUsage>
      undone: Undone[]
      topic: string
      project: string
      head: Head
      jira: JiraState
      ship: Ship | null
      // Cache (moved in from cache-keeper 0.2.0).
      lastAt: number | null
      lastModel: string | null
      ttlMin: number
      tick: number
      warnedFor: number | null
      eating: string
      hidden: boolean
    }
  }
}
