'use client'

const contracts = [
  'StrategyVault',
  'AgentOrchestrator',
  'MirrorReactor',
  'StopReactor',
  'DrawdownGuard',
  'EpochCron',
  'PerformanceLedger',
  'FeeDistributor',
]

export function DeployHero() {
  return (
    <div className="space-y-4 border-b border-border pb-6">
      <div className="max-w-2xl space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Deploy a strategy vault
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Configure an autonomous agent that publishes verifiable signals on-chain. Followers mirror
          execution atomically via Somnia reactivity.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {contracts.map(name => (
          <span
            key={name}
            className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
