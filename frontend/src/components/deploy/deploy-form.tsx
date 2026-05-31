'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther } from 'viem'
import { vaultFactoryConfig } from '@/lib/contracts'
import { TxStatus } from '@/components/common/tx-status'
import { PromptPreview } from './prompt-preview'

export function DeployForm() {
  const router = useRouter()
  const { address } = useAccount()
  const [strategyPrompt, setStrategyPrompt] = useState('')
  const [feeBps, setFeeBps] = useState(500)
  const [maxDrawdownBps, setMaxDrawdownBps] = useState(2000)
  const [deposit, setDeposit] = useState('1')

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  function handleDeploy() {
    if (!strategyPrompt) return
    writeContract({
      ...vaultFactoryConfig,
      functionName: 'deployVault',
      args: [strategyPrompt, feeBps, BigInt(maxDrawdownBps)],
      value: parseEther(deposit),
    })
  }

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'

  function handleClose() {
    reset()
    if (isSuccess) {
      router.push('/')
    }
  }

  if (!address) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-12 text-center backdrop-blur-sm">
        <p className="text-lg text-zinc-400">Connect your wallet to deploy a vault</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-6 backdrop-blur-sm">
          <h2 className="mb-6 text-sm font-medium uppercase tracking-wider text-zinc-500">Vault Configuration</h2>

          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Strategy Prompt</label>
              <textarea
                value={strategyPrompt}
                onChange={e => setStrategyPrompt(e.target.value)}
                rows={6}
                placeholder="Describe your trading strategy. The AI agent will follow these instructions to generate trading signals autonomously..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Performance Fee: <span className="font-mono text-zinc-300">{(feeBps / 100).toFixed(1)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={2000}
                step={50}
                value={feeBps}
                onChange={e => setFeeBps(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
                <span>0%</span>
                <span>20%</span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Max Drawdown: <span className="font-mono text-zinc-300">{(maxDrawdownBps / 100).toFixed(0)}%</span>
              </label>
              <input
                type="range"
                min={500}
                max={5000}
                step={100}
                value={maxDrawdownBps}
                onChange={e => setMaxDrawdownBps(Number(e.target.value))}
                className="w-full accent-red-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
                <span>5%</span>
                <span>50%</span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Agent Funding (STT)</label>
              <input
                type="number"
                value={deposit}
                onChange={e => setDeposit(e.target.value)}
                step="0.1"
                min="0"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 font-mono text-sm text-zinc-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <p className="mt-1 text-[10px] text-zinc-600">Funds the AI agent pipeline (orchestrator + epoch cron)</p>
            </div>

            <button
              onClick={handleDeploy}
              disabled={!strategyPrompt || isPending || isConfirming}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Confirm in Wallet...' : isConfirming ? 'Deploying Vault (8 contracts)...' : 'Deploy Vault'}
            </button>

            <p className="text-center text-[11px] text-zinc-600">
              Deploys StrategyVault, AgentOrchestrator, MirrorReactor, StopReactor, DrawdownGuard, EpochCron, PerformanceLedger, and FeeDistributor via EIP-1167 minimal clones in a single transaction.
            </p>
          </div>
        </div>
      </div>

      <PromptPreview name={strategyPrompt.slice(0, 50)} description={strategyPrompt} />

      <TxStatus state={txState} hash={txHash} error={writeError?.message} onClose={handleClose} />
    </div>
  )
}
