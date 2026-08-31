export const VaultFactoryABI = [
  {
    type: 'function',
    name: 'deployVault',
    inputs: [
      { name: 'strategyPrompt', type: 'string' },
      { name: 'performanceFeeBps', type: 'uint16' },
      { name: 'maxDrawdownBps', type: 'uint256' },
      { name: 'signalPricePerSignal', type: 'uint256' },
      { name: 'instrument', type: 'uint8' },
    ],
    outputs: [{ name: 'vaultId', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'deployAgentVault',
    inputs: [
      { name: 'description', type: 'string' },
      { name: 'performanceFeeBps', type: 'uint16' },
      { name: 'maxDrawdownBps', type: 'uint256' },
      { name: 'signalPricePerSignal', type: 'uint256' },
      { name: 'instrument', type: 'uint8' },
    ],
    outputs: [{ name: 'vaultId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'deployCustomAgentVault',
    inputs: [
      { name: 'description', type: 'string' },
      { name: 'performanceFeeBps', type: 'uint16' },
      { name: 'maxDrawdownBps', type: 'uint256' },
      { name: 'signalPricePerSignal', type: 'uint256' },
    ],
    outputs: [{ name: 'vaultId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'deployWalletVault',
    inputs: [
      { name: 'sourceWallet', type: 'address' },
      { name: 'description', type: 'string' },
      { name: 'performanceFeeBps', type: 'uint16' },
      { name: 'maxDrawdownBps', type: 'uint256' },
      { name: 'signalPricePerSignal', type: 'uint256' },
      { name: 'instrument', type: 'uint8' },
    ],
    outputs: [{ name: 'vaultId', type: 'uint256' }],
    stateMutability: 'nonpayable',
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
          { name: 'eventRouter', type: 'address' },
          { name: 'instrumentType', type: 'uint8' },
          { name: 'strategist', type: 'address' },
          { name: 'deployedAt', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDeploymentCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getStrategistVaults',
    inputs: [{ name: '_strategist', type: 'address' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'vaultIndex',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'VaultDeployed',
    inputs: [
      { name: 'vaultId', type: 'uint256', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'strategist', type: 'address', indexed: true },
      { name: 'orchestrator', type: 'address', indexed: false },
      { name: 'mirrorReactor', type: 'address', indexed: false },
      { name: 'eventRouter', type: 'address', indexed: false },
      { name: 'sourceType', type: 'uint8', indexed: false },
      { name: 'instrumentType', type: 'uint8', indexed: false },
    ],
  },
] as const;

/** Pre–event-router factories emit a shorter VaultDeployed event. */
export const LegacyVaultDeployedEventABI = [
  {
    type: 'event',
    name: 'VaultDeployed',
    inputs: [
      { name: 'vaultId', type: 'uint256', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'strategist', type: 'address', indexed: true },
      { name: 'orchestrator', type: 'address', indexed: false },
      { name: 'mirrorReactor', type: 'address', indexed: false },
    ],
  },
] as const;

/** getDeployment tuple on older factories (no eventRouter field). */
export const LegacyVaultFactoryABI = [
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
] as const;

/** VaultDeployed(..., sourceType, instrumentType) — current factory. */
export const VAULT_DEPLOYED_TOPIC =
  '0x31959bd64da9a16a60462bea4c9a54aeec3ceabeafbb52ba20ba2df24c19ef2e' as const;

/** VaultDeployed(..., sourceType) only — intermediate factory generation. */
export const VAULT_DEPLOYED_SOURCE_TYPE_TOPIC =
  '0xf1fcf8a01ec14128d305ee66cce112914066c083e847e90abca80c7003a0fd8e' as const;

export const LEGACY_VAULT_DEPLOYED_TOPIC =
  '0xcabab36694e812ab0b5ab0e8ef8cfd457e78f3fbb45b87dba01d7d18150fbe09' as const;

/** All VaultDeployed topic hashes the resolver should accept. */
export const VAULT_DEPLOYED_TOPICS = [
  VAULT_DEPLOYED_TOPIC,
  VAULT_DEPLOYED_SOURCE_TYPE_TOPIC,
  LEGACY_VAULT_DEPLOYED_TOPIC,
] as const;
