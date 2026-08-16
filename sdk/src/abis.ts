export const strategyVaultAbi = [
  {
    type: 'function',
    name: 'orchestrator',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const

export const externalSignalPublisherAbi = [
  {
    type: 'function',
    name: 'isCustomPublisher',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'publish',
    inputs: [
      { name: 'direction', type: 'int8' },
      { name: 'sizeBps', type: 'uint16' },
      { name: 'stopPrice', type: 'uint256' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const
