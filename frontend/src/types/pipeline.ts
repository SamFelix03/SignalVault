export const StageType = {
  IDLE: 'idle',
  FETCHING: 'fetching',
  SCRAPING: 'scraping',
  REASONING: 'reasoning',
  COMPLETE: 'complete',
} as const

export type StageTypeValue = (typeof StageType)[keyof typeof StageType]

export interface PipelineStage {
  type: StageTypeValue
  label: string
  startedAt?: number
  completedAt?: number
  data?: Record<string, unknown>
}

export interface PipelineRun {
  vaultAddress: string
  epoch: number
  currentStage: StageTypeValue
  stages: PipelineStage[]
  startedAt: number
  completedAt?: number
}

export interface AgentReceipt {
  hash: string
  vaultAddress: string
  epoch: number
  blockNumber: number
  txHash: string
  stages: {
    jsonApi?: StageJsonApi
    parseWebsite?: StageParseWebsite
    inferToolsChat?: StageInferToolsChat
  }
}

export interface StageJsonApi {
  url: string
  rawResult: unknown
  extractedValue: string
  validators: string[]
}

export interface StageParseWebsite {
  url: string
  markdownSnippet: string
  confidence: number
  answerable: boolean
}

export interface StageInferToolsChat {
  systemPrompt: string
  userMessage: string
  chainOfThought: string
  toolCalled: string
  toolArguments: Record<string, unknown>
  /** Set when pipeline completed via rule-based fallback after agent timeout */
  ruleBased?: boolean
}
