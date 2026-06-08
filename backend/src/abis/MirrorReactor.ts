export const MirrorReactorABI = [
  {
    type: 'event',
    name: 'MirrorExecuted',
    inputs: [
      { name: 'follower', type: 'address', indexed: true },
      { name: 'direction', type: 'int8', indexed: false },
      { name: 'size', type: 'uint256', indexed: false },
      { name: 'positionId', type: 'bytes32', indexed: false },
      { name: 'price', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MirrorSettled',
    inputs: [
      { name: 'follower', type: 'address', indexed: true },
      { name: 'direction', type: 'int8', indexed: false },
      { name: 'entryPrice', type: 'uint256', indexed: false },
      { name: 'exitPrice', type: 'uint256', indexed: false },
      { name: 'size', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'dex',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'followerOpenLegs',
    inputs: [{ name: 'follower', type: 'address' }],
    outputs: [
      { name: 'direction', type: 'int8' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'size', type: 'uint256' },
      { name: 'positionId', type: 'bytes32' },
    ],
    stateMutability: 'view',
  },
] as const;
