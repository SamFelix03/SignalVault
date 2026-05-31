'use client'

import { useState, useMemo } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useVaultList } from '@/hooks/use-vault-list'
import { VaultCard } from '@/components/leaderboard/vault-card'
import { LoadingSpinner } from '@/components/common/loading-spinner'
import { cn } from '@/lib/utils'

type SortKey = 'pnl' | 'sharpe' | 'followers'

export default function LeaderboardPage() {
  const { vaults, isLoading, error } = useVaultList()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('pnl')

  const filtered = useMemo(() => {
    let list = vaults

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        v =>
          v.name?.toLowerCase().includes(q) ||
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Vault Leaderboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Discover and follow autonomous trading vaults on Somnia</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vaults..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 py-2 pl-10 pr-4 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500/50 focus:outline-none sm:w-72"
          />
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-zinc-500" />
          <span className="text-xs text-zinc-500">Sort by:</span>
          {(['pnl', 'sharpe', 'followers'] as const).map(key => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                sortBy === key ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              )}
            >
              {key === 'pnl' ? '30d PnL' : key === 'sharpe' ? 'Sharpe' : 'Followers'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <p className="text-red-400">Failed to load vaults</p>
          <p className="mt-1 text-sm text-zinc-500">{error.message}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/60 bg-[#111118]/80 p-12 text-center backdrop-blur-sm">
          <p className="text-zinc-400">{search ? 'No vaults match your search' : 'No vaults deployed yet'}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(vault => (
            <VaultCard key={vault.address} vault={vault} />
          ))}
        </div>
      )}
    </div>
  )
}
