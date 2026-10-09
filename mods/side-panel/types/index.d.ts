export type Section = { title: string; count: number; rows: string[]; note?: string }
// One agent's card: `ctx` is a whole percent, absent when its model differs from the session's (unknown window).
export type Agent = { label: string; status: string; elapsed: string; model: string; effort: string; tokens: number; usd: number; ctx?: number }
export type AgentCounts = { working: number; waiting: number; done: number; stuck: number }
// Header tiles: ≈$ attributed to agents, their tokens, and wall time since the first agent started.
export type AgentTotals = { usd: number; tokens: number; time: string }
export type AgentBoard = { counts: AgentCounts; totals: AgentTotals; rows: Agent[]; finished: Agent[] }
// Per loop ('' = the main conversation): what its turn.step results report.
export type LoopUsage = { model: string; effort: string; tokens: number; lastInput: number }
export type Undone = { text: string }
export type JiraIssue = { key: string; summary: string; status: string }
// 'waiting' until a project-wide Jira search runs this session; 'unavailable' when it failed.
export type JiraState = 'waiting' | 'unavailable' | JiraIssue[]

declare module 'claude-code' {
  interface PluginState {
    'side-panel': {
      sections: Section[]
      agents: AgentBoard
      usage: Record<string, LoopUsage>
      showFinished: boolean
      undone: Undone[]
      topic: string
      project: string
      jira: JiraState
    }
  }
}
