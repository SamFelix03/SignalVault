const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getDeploymentCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDeployment',
    inputs: [{ name: 'vaultId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'vault', type: 'address' },
          { name: 'orchestrator', type: 'address' },
          { name: 'mirrorReactor', type: 'address' },
          { name: 'stopReactor', type: 'address' },
          { name: 'drawdownGuard', type: 'address' },
          { name: 'epochCron', type: 'address' },
          { name: 'performanceLedger', type: 'address' },
          { name: 'feeDistributor', type: 'address' },
          { name: 'strategist', type: 'address' },
          { name: 'deployedAt', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
]

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
          { name: 'stopPrice', type: 'uint256' },
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
    name: 'getFollowerConfig',
    inputs: [{ name: 'follower', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'riskPct', type: 'uint16' },
          { name: 'maxPositionSize', type: 'uint256' },
          { name: 'maxSlippageBps', type: 'uint16' },
          { name: 'stopLossBuffer', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'subscribe',
    inputs: [
      {
        name: 'config',
        type: 'tuple',
        components: [
          { name: 'riskPct', type: 'uint16' },
          { name: 'maxPositionSize', type: 'uint256' },
          { name: 'maxSlippageBps', type: 'uint16' },
          { name: 'stopLossBuffer', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
]

const MIRROR_REACTOR_ABI = [
  {
    type: 'function',
    name: 'dex',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
]

const DREAMDEX_ADAPTER_ABI = [
  {
    type: 'function',
    name: 'depositQuote',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'depositBase',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'quoteToken',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'baseToken',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
]

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
]

const ORACLE_ABI = [
  {
    type: 'function',
    name: 'latestRoundData',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
  },
]

export {
  FACTORY_ABI,
  STRATEGY_VAULT_ABI,
  MIRROR_REACTOR_ABI,
  DREAMDEX_ADAPTER_ABI,
  ERC20_ABI,
  ORACLE_ABI,
}
