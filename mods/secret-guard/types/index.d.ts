declare module 'claude-code' {
  interface PluginState {
    'secret-guard': {
      off: boolean
    }
  }
}
export type Choice = "Mask" | "Send anyway" | "Cancel"
