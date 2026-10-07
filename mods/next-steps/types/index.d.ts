export type Question = { n: number; text: string; options: string[] }

declare module 'claude-code' {
  interface PluginState {
    'next-steps': {
      questions: Question[] | null
      picks: Record<string, string>
      hidden: boolean
    }
  }
}
