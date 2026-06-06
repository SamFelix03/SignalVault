export const agentOrchestratorAbi = [
  { type: 'function', name: 'currentRunId', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getPipelineStatus', inputs: [{ name: 'runId', type: 'uint256' }], outputs: [{ name: 'stage', type: 'uint8' }, { name: 'flags', type: 'uint8' }, { name: 'startedAt', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getPipelineData', inputs: [{ name: 'runId', type: 'uint256' }], outputs: [{ name: 'fetchedPrice', type: 'uint256' }, { name: 'fetchedFunding', type: 'uint256' }, { name: 'fearGreedIndex', type: 'uint256' }, { name: 'newsSummary', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'startPipeline', inputs: [], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'strategyPrompt', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'event', name: 'PipelineStarted', inputs: [{ name: 'runId', type: 'uint256', indexed: true }, { name: 'timestamp', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'PipelineCompleted', inputs: [{ name: 'runId', type: 'uint256', indexed: true }, { name: 'direction', type: 'int8', indexed: false }, { name: 'sizeBps', type: 'uint16', indexed: false }] },
  { type: 'event', name: 'PipelineFailed', inputs: [{ name: 'runId', type: 'uint256', indexed: true }, { name: 'reason', type: 'string', indexed: false }] },
  { type: 'event', name: 'StageCompleted', inputs: [{ name: 'runId', type: 'uint256', indexed: true }, { name: 'stage', type: 'string', indexed: false }, { name: 'requestId', type: 'uint256', indexed: false }] },
] as const
