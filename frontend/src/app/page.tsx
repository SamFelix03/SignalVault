'use client'

import { useEffect, useMemo, useState } from 'react'
import { useVaultList } from '@/hooks/use-vault-list'
import { FeaturedVaultCard } from '@/components/leaderboard/featured-vault-card'
import { LeaderboardStats } from '@/components/leaderboard/leaderboard-stats'
import { LoadingSpinner } from '@/components/common/loading-spinner'
import { usePageHeader } from '@/components/layout/page-header-context'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

type SortKey = 'pnl' | 'sharpe' | 'followers'

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'pnl', label: '30d PnL' },
  { key: 'sharpe', label: 'Sharpe' },
  { key: 'followers', label: 'Followers' },
]

export default function LeaderboardPage() {
  const { vaults, isLoading, error } = useVaultList()
  const { search, setSearch, setShowSearch } = usePageHeader()
  const [sortBy, setSortBy] = useState<SortKey>('pnl')

  useEffect(() => {
    setShowSearch(true)
    return () => {
      setShowSearch(false)
      setSearch('')
    }
  }, [setShowSearch, setSearch])

  const filtered = useMemo(() => {
    let list = vaults

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        v =>
          v.name?.toLowerCase().includes(q) ||
          v.strategyPrompt?.toLowerCase().includes(q) ||
          v.address.toLowerCase().includes(q) ||
          v.strategist?.toLowerCase().includes(q)
      )
    }

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'pnl':
          return (b.stats?.totalPnl ?? 0) - (a.stats?.totalPnl ?? 0)
        case 'sharpe':
          return (b.stats?.sharpeRatio ?? 0) - (a.stats?.sharpeRatio ?? 0)
        case 'followers':
          return (b.followerCount ?? b.stats?.followerCount ?? 0) - (a.followerCount ?? a.stats?.followerCount ?? 0)
        default:
          return 0
      }
    })

    return list
  }, [vaults, search, sortBy])

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="border-b border-border pb-6">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Autonomous strategy vaults on Somnia. Signals and reasoning are committed on-chain; followers
          mirror execution in the same block.
        </p>
        {!isLoading && vaults.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {vaults.length} vault{vaults.length !== 1 ? 's' : ''} indexed
          </p>
        )}
      </div>

      {!isLoading && !error && vaults.length > 0 && <LeaderboardStats vaults={vaults} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium text-foreground">
          {search ? `Results for "${search}"` : 'All vaults'}
          {!isLoading && (
            <span className="ml-2 font-normal text-muted-foreground">({filtered.length})</span>
          )}
        </h2>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {sortOptions.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                sortBy === key
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <Card className="border-destructive/30">
          <CardContent className="p-8 text-center">
            <p className="text-destructive">Failed to load vaults</p>
            <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">
              {search ? 'No vaults match your search' : 'No vaults deployed yet'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((vault, i) => (
            <FeaturedVaultCard
              key={vault.address}
              vault={vault}
              index={i}
              rank={i + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
