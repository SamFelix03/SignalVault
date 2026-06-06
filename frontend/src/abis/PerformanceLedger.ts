export const performanceLedgerAbi = [
  { type: 'function', name: 'stats', inputs: [], outputs: [{ name: 'totalPnl', type: 'int256' }, { name: 'totalTrades', type: 'uint256' }, { name: 'winCount', type: 'uint256' }, { name: 'lossCount', type: 'uint256' }, { name: 'highWaterMark', type: 'int256' }, { name: 'maxDrawdownBps', type: 'uint256' }, { name: 'currentDrawdownBps', type: 'uint256' }, { name: 'sumReturns', type: 'int256' }, { name: 'sumSquaredReturns', type: 'int256' }, { name: 'lastSettledEpoch', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getWinRate', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getSharpeApprox', inputs: [], outputs: [{ name: '', type: 'int256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTradeCount', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTradeHistory', inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ components: [{ name: 'direction', type: 'int8' }, { name: 'entryPrice', type: 'uint256' }, { name: 'exitPrice', type: 'uint256' }, { name: 'size', type: 'uint256' }, { name: 'pnl', type: 'int256' }, { name: 'timestamp', type: 'uint256' }], name: '', type: 'tuple[]' }], stateMutability: 'view' },
] as const
