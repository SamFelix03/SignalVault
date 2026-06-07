'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectButton } from '@/components/common/connect-button'
import { usePageHeader } from '@/components/layout/page-header-context'

const routeTitles: Record<string, string> = {
  '/': 'Vault Leaderboard',
  '/deploy': 'Deploy Vault',
  '/follow': 'Follow Dashboard',
}

function getDefaultTitle(pathname: string): string {
  if (pathname.startsWith('/vault/') && pathname.includes('/audit/')) {
    return 'Audit Trail'
  }
  if (pathname.startsWith('/vault/')) {
    return 'Strategy Vault'
  }
  return routeTitles[pathname] ?? 'SignalVault'
}

export function AppHeader() {
  const pathname = usePathname()
  const { title, search, setSearch, showSearch } = usePageHeader()
  const [searchFocused, setSearchFocused] = useState(false)

  const pageTitle = title ?? getDefaultTitle(pathname)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-4">
        <h1 className="truncate text-xl font-semibold text-foreground">{pageTitle}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {showSearch && (
          <div
            className={cn(
              'relative hidden items-center transition-all duration-300 sm:flex',
              searchFocused ? 'w-64' : 'w-48'
            )}
          >
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search vaults..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="h-9 w-full rounded-lg border border-border bg-secondary pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
        )}
        <ConnectButton />
      </div>
    </header>
  )
}
