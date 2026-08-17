'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { type Address } from 'viem'
import { Bell, BellOff, ExternalLink } from 'lucide-react'
import { API_URL } from '@/lib/contracts'
import { TELEGRAM_BOT_USERNAME } from '@/lib/constants'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'signalvault_telegram_user'

interface StoredTelegramUser {
  chatId: string
  username?: string
  firstName?: string
}

interface TelegramAlertsSetupProps {
  vaultAddress: Address
}

function loadStoredUser(): StoredTelegramUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredTelegramUser) : null
  } catch {
    return null
  }
}

function saveStoredUser(user: StoredTelegramUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

/** Telegram connect + alert toggle — rendered inside SubscribeForm after on-chain subscribe. */
export function TelegramAlertsSetup({ vaultAddress }: TelegramAlertsSetupProps) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [user, setUser] = useState<StoredTelegramUser | null>(null)
  const [alertsOn, setAlertsOn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [waitingForTelegram, setWaitingForTelegram] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const botUsername = TELEGRAM_BOT_USERNAME.trim()

  const refreshAlerts = useCallback(async (chatId: string) => {
    const res = await fetch(
      `${API_URL}/api/telegram/subscriptions?chatId=${encodeURIComponent(chatId)}&vault=${encodeURIComponent(vaultAddress)}`,
    )
    if (!res.ok) {
      if (res.status === 503) {
        setError('Telegram alerts are not configured on the server.')
        return
      }
      throw new Error(`Failed to check alerts (${res.status})`)
    }
    const data = await res.json()
    setAlertsOn(Boolean(data.subscribed))
  }, [vaultAddress])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setWaitingForTelegram(false)
  }, [])

  const startPolling = useCallback(
    (token: string) => {
      stopPolling()
      setWaitingForTelegram(true)

      const check = async () => {
        try {
          const res = await fetch(`${API_URL}/api/telegram/link/${encodeURIComponent(token)}`)
          if (!res.ok) return

          const data = await res.json()
          if (data.expired) {
            stopPolling()
            setError('Link expired. Tap Connect Telegram again.')
            return
          }

          if (data.linked && data.chatId) {
            const linkedUser: StoredTelegramUser = {
              chatId: String(data.chatId),
              username: data.username,
              firstName: data.firstName,
            }
            saveStoredUser(linkedUser)
            setUser(linkedUser)
            setAlertsOn(true)
            setError(null)
            stopPolling()
          }
        } catch {
          // keep polling
        }
      }

      void check()
      pollRef.current = setInterval(() => void check(), 2000)
    },
    [stopPolling],
  )

  useEffect(() => {
    const stored = loadStoredUser()
    setUser(stored)
    if (!stored) {
      setLoading(false)
      return
    }
    refreshAlerts(String(stored.chatId))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load alerts'))
      .finally(() => setLoading(false))
  }, [refreshAlerts])

  useEffect(() => () => stopPolling(), [stopPolling])

  async function connectTelegram() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/telegram/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault: vaultAddress }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to create link (${res.status})`)
      }

      const telegramUrl =
        data.telegramUrl ??
        (botUsername ? `https://t.me/${botUsername}?start=${data.token}` : null)

      if (!telegramUrl) {
        throw new Error('Telegram bot username is not configured.')
      }

      startPolling(data.token)
      window.open(telegramUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Telegram')
    } finally {
      setBusy(false)
    }
  }

  async function disableAlerts() {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/telegram/subscribe`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vault: vaultAddress, chatId: user.chatId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Failed to disable alerts (${res.status})`)
      }
      setAlertsOn(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable alerts')
    } finally {
      setBusy(false)
    }
  }

  if (!botUsername) {
    return (
      <p className="text-xs text-muted-foreground">
        Telegram alerts unavailable — set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME in frontend/.env.
      </p>
    )
  }

  const displayName = user?.username
    ? `@${user.username}`
    : user?.firstName ?? 'Telegram'

  return (
    <div className="space-y-4 border-t border-border/60 pt-4">
      <div>
        <p className="text-sm font-medium text-foreground">Telegram signal alerts</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Get a DM when this vault publishes a new signal. No user ID needed — just open the bot and
          press Start.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !user ? (
        <div className="space-y-3">
          <Button
            type="button"
            onClick={connectTelegram}
            disabled={busy || waitingForTelegram}
            className="w-full gap-2"
            size="sm"
          >
            <ExternalLink className="h-4 w-4" />
            {waitingForTelegram ? 'Waiting for you in Telegram…' : 'Connect Telegram'}
          </Button>

          {waitingForTelegram && (
            <p className="text-xs text-muted-foreground">
              Press <span className="font-medium text-foreground">Start</span> in @{botUsername},
              then return here — we&apos;ll detect it automatically.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            Connected as <span className="font-medium">{displayName}</span>
          </p>

          {alertsOn ? (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
              <Bell className="h-4 w-4 shrink-0" />
              Signal alerts enabled
            </div>
          ) : (
            <Button onClick={connectTelegram} disabled={busy} className="w-full" size="sm">
              Re-enable signal alerts
            </Button>
          )}

          {alertsOn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={disableAlerts}
              disabled={busy}
              className="gap-1 text-muted-foreground"
            >
              <BellOff className="h-3.5 w-3.5" />
              Turn off Telegram alerts
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
