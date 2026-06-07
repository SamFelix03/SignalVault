'use client'

import { CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type TxState = 'idle' | 'pending' | 'confirming' | 'success' | 'error'

interface TxStatusProps {
  state: TxState
  hash?: string
  error?: string
  onClose?: () => void
}

export function TxStatus({ state, hash, error, onClose }: TxStatusProps) {
  const open = state !== 'idle'
  const explorerUrl = hash ? `https://shannon-explorer.somnia.network/tx/${hash}` : undefined

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose?.()}>
      <DialogContent showCloseButton={state === 'success' || state === 'error'} className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          {(state === 'pending' || state === 'confirming') && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-accent" />
              <DialogTitle>
                {state === 'pending' ? 'Confirm in Wallet' : 'Confirming Transaction...'}
              </DialogTitle>
              <DialogDescription>
                {state === 'pending'
                  ? 'Please confirm the transaction in your wallet'
                  : 'Waiting for on-chain confirmation'}
              </DialogDescription>
            </>
          )}

          {state === 'success' && (
            <>
              <CheckCircle className="h-12 w-12 text-success" />
              <DialogTitle>Transaction Confirmed</DialogTitle>
            </>
          )}

          {state === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <DialogTitle>Transaction Failed</DialogTitle>
              {error && <DialogDescription className="text-destructive">{error}</DialogDescription>}
            </>
          )}
        </DialogHeader>

        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-sm text-accent hover:text-accent/80"
          >
            View on Explorer <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}

        {(state === 'success' || state === 'error') && onClose && (
          <DialogFooter className="sm:justify-center">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
