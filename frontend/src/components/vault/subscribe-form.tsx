'use client'

import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { parseEther, type Address } from 'viem'
import { vaultConfig } from '@/lib/contracts'
import { TxStatus } from '@/components/common/tx-status'
import { cn } from '@/lib/utils'

interface SubscribeFormProps {
  vaultAddress: Address
  isSubscribed: boolean
  onSuccess?: () => void
}

export function SubscribeForm({ vaultAddress, isSubscribed, onSuccess }: SubscribeFormProps) {
  const { address } = useAccount()
  const [riskBps, setRiskBps] = useState(1000)
  const [maxPositionUsd, setMaxPositionUsd] = useState('1000')
  const [maxSlippageBps, setMaxSlippageBps] = useState(100)
  const [stopLossBuffer, setStopLossBuffer] = useState('50')

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  function handleSubscribe() {
    writeContract({
      ...vaultConfig(vaultAddress),
      functionName: 'subscribe',
      args: [{
        riskPct: riskBps,
        maxPositionSize: parseEther(maxPositionUsd),
        maxSlippageBps: maxSlippageBps,
        stopLossBuffer: parseEther(stopLossBuffer),
        active: true,
      }],
    })
  }

  function handleUnsubscribe() {
    writeContract({
      ...vaultConfig(vaultAddress),
      functionName: 'unsubscribe',
    })
  }

  const txState = isPending ? 'pending' : isConfirming ? 'confirming' : isSuccess ? 'success' : writeError ? 'error' : 'idle'

  function handleClose() {
    reset()
    if (isSuccess) onSuccess?.()
  }

  if (!address) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-6 text-center backdrop-blur-sm">
        <p className="text-zinc-400">Connect your wallet to subscribe</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-6 backdrop-blur-sm">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">
        {isSubscribed ? 'Manage Subscription' : 'Subscribe to Signals'}
      </h2>

      {!isSubscribed ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Risk Level: <span className="font-mono text-zinc-300">{(riskBps / 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min={100}
              max={10000}
              step={100}
              value={riskBps}
              onChange={e => setRiskBps(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-500">Max Position (USD)</label>
            <input
              type="number"
              value={maxPositionUsd}
              onChange={e => setMaxPositionUsd(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Max Slippage: <span className="font-mono text-zinc-300">{(maxSlippageBps / 100).toFixed(1)}%</span>
            </label>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={maxSlippageBps}
              onChange={e => setMaxSlippageBps(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-500">Stop Loss Buffer (USD)</label>
            <input
              type="number"
              value={stopLossBuffer}
              onChange={e => setStopLossBuffer(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleSubscribe}
            disabled={isPending || isConfirming}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50"
          >
            Subscribe
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-emerald-400">You are currently subscribed to this vault.</p>
          <button
            onClick={handleUnsubscribe}
            disabled={isPending || isConfirming}
            className="w-full rounded-lg border border-red-500/40 bg-red-500/10 py-3 text-sm font-semibold text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
          >
            Unsubscribe
          </button>
        </div>
      )}

      <TxStatus state={txState} hash={txHash} error={writeError?.message} onClose={handleClose} />
    </div>
  )
}
