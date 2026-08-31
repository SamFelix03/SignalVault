const STRATEGY_VAULT_ABI = [
  {
    type: 'function',
    name: 'getCurrentSignal',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'direction', type: 'int8' },
          { name: 'sizeBps', type: 'uint16' },
          { name: 'marketId', type: 'bytes32' },
          { name: 'limitPrice', type: 'uint256' },
          { name: 'epoch', type: 'uint256' },
          { name: 'reasoningHash', type: 'bytes32' },
          { name: 'reasoningSummary', type: 'string' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'strategyPrompt',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
]

export { STRATEGY_VAULT_ABI }
