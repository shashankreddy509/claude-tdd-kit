export type Pending = 'handoff' | 'start' | null

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': {
      lastAt: number | null
      model: string | null
      ttlMin: number
      tick: number
      warnedFor: number | null
      pending: Pending
      eating: string
      hidden: boolean
    }
  }
}
