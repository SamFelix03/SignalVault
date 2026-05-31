'use client'

import { CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

type TxState = 'idle' | 'pending' | 'confirming' | 'success' | 'error'

interface TxStatusProps {
  state: TxState
  hash?: string
  error?: string
  onClose?: () => void
}

export function TxStatus({ state, hash, error, onClose }: TxStatusProps) {
  if (state === 'idle') return null

  const explorerUrl = hash ? `https://shannon-explorer.somnia.network/tx/${hash}` : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#111118] p-6 shadow-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          {(state === 'pending' || state === 'confirming') && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
              <p className="text-lg font-medium text-zinc-200">
                {state === 'pending' ? 'Confirm in Wallet' : 'Confirming Transaction...'}
              </p>
              <p className="text-sm text-zinc-500">
                {state === 'pending' ? 'Please confirm the transaction in your wallet' : 'Waiting for on-chain confirmation'}
              </p>
            </>
          )}

          {state === 'success' && (
            <>
              <CheckCircle className="h-12 w-12 text-emerald-500" />
              <p className="text-lg font-medium text-zinc-200">Transaction Confirmed</p>
            </>
          )}

          {state === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-red-500" />
              <p className="text-lg font-medium text-zinc-200">Transaction Failed</p>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </>
          )}

          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300')}
            >
              View on Explorer <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {(state === 'success' || state === 'error') && onClose && (
            <button
              onClick={onClose}
              className="mt-2 rounded-lg bg-zinc-800 px-6 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
