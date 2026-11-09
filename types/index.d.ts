export type Step = { text: string; status: 'done' | 'doing' | 'todo' }
export type Status = { goal: string; summary: string; current: string; detail: string; steps: Step[] }
export type Usage = { tokens: number; percent: number; usd: number }
export type View = { isProgressOpen: boolean }
export type Model = { name: string; effort: string }
export type Git = { branch: string; files: string[]; worktree: string; isLinked: boolean }
export type PaneState = { isClosed: boolean }
export type Activity = { prompt: string; lastTool: string; isBusy: boolean }

declare module 'claude-code' {
  interface PluginState {
    'cc-side-session-summary': {
      status: Shaped<Status>
      activity: Shaped<Activity>
      git: Shaped<Git>
      usage: Shaped<Usage>
      view: Shaped<View>
      model: Shaped<Model>
      pane: Shaped<PaneState>
    }
  }
}
