export type Section = { title: string; count: number; rows: string[]; note?: string }
export type Agent = { label: string; status: string; elapsed: string }
export type AgentCounts = { working: number; waiting: number; done: number; stuck: number }
export type Undone = { source: 'file' | 'said'; text: string }
export type JiraIssue = { key: string; summary: string; status: string }
// 'waiting' until a project-wide Jira search runs this session; 'unavailable' when it failed.
export type JiraState = 'waiting' | 'unavailable' | JiraIssue[]

declare module 'claude-code' {
  interface PluginState {
    'side-panel': {
      sections: Section[]
      agents: { counts: AgentCounts; rows: Agent[] }
      undone: Undone[]
      topic: string
      project: string
      jira: JiraState
    }
  }
}
