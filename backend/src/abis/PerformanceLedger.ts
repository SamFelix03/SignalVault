export const PerformanceLedgerABI = [
  {
    type: 'event',
    name: 'TradeSettled',
    inputs: [
      { name: 'vault', type: 'address', indexed: true },
      { name: 'follower', type: 'address', indexed: true },
      { name: 'direction', type: 'int8', indexed: false },
      { name: 'entryPrice', type: 'uint256', indexed: false },
      { name: 'exitPrice', type: 'uint256', indexed: false },
      { name: 'pnlBps', type: 'int256', indexed: false },
      { name: 'signalHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DrawdownUpdated',
    inputs: [
      { name: 'vault', type: 'address', indexed: true },
      { name: 'maxDrawdownBps', type: 'uint256', indexed: false },
      { name: 'sharpe30dBps', type: 'int256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'getVaultStats',
    inputs: [{ name: 'vault', type: 'address' }],
    outputs: [
      { name: 'totalTrades', type: 'uint256' },
      { name: 'winCount', type: 'uint256' },
      { name: 'totalPnlBps', type: 'int256' },
      { name: 'maxDrawdownBps', type: 'uint256' },
      { name: 'sharpe30dBps', type: 'int256' },
    ],
    stateMutability: 'view',
  },
] as const;
