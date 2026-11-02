export interface UpdateStep {
  id: string
  label: string
  state: 'pending' | 'running' | 'done' | 'skipped' | 'error'
}

export interface UpdateStatus {
  state: 'idle' | 'running' | 'success' | 'error'
  startedAt: string | null
  finishedAt: string | null
  steps: UpdateStep[]
  log: string[]
  restarting: boolean
  changed: boolean
  message: string
}

export interface Updater {
  supervised: boolean
  getStatus(): UpdateStatus
  start(): UpdateStatus
}

export function createUpdater(options: { rootDir: string; supervised: boolean }): Updater
