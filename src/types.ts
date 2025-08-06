export interface RetryConfig {
  maxRetries?: number
  initialDelay?: number
  backoffFactor?: number
}

export interface SyncOptions {
  upstreamRepo: string
  upstreamBranch: string
  companyBranch: string
  syncDirs: string[]
  commitMessage: string
  autoPush: boolean
  forceOverwrite?: boolean
  verbose?: boolean
  silent?: boolean
  dryRun?: boolean
  retryConfig?: RetryConfig
}
