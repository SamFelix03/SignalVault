export const AgentOrchestratorABI = [
  {
    type: 'function',
    name: 'currentRunId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPipelineStatus',
    inputs: [{ name: 'runId', type: 'uint256' }],
    outputs: [
      { name: 'stage', type: 'uint8' },
      { name: 'flags', type: 'uint8' },
      { name: 'startedAt', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPipelineData',
    inputs: [{ name: 'runId', type: 'uint256' }],
    outputs: [
      { name: 'fetchedPrice', type: 'uint256' },
      { name: 'fetchedFunding', type: 'uint256' },
      { name: 'fearGreedIndex', type: 'uint256' },
      { name: 'newsSummary', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'startPipeline',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;
