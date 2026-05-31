'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, BarChart3, Rocket, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectButton } from '@/components/common/connect-button'

const navLinks = [
  { href: '/', label: 'Leaderboard', icon: BarChart3 },
  { href: '/deploy', label: 'Deploy', icon: Rocket },
  { href: '/follow', label: 'Dashboard', icon: LayoutDashboard },
]

export function Header() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/30">
              <Activity className="h-4.5 w-4.5 text-blue-400" />
              <div className="absolute inset-0 rounded-lg bg-blue-500/20 animate-pulse" />
            </div>
            <span className="text-lg font-bold tracking-tight text-zinc-100 group-hover:text-white transition-colors">
              Signal<span className="text-blue-400">Vault</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>

        <ConnectButton />
      </div>
    </header>
  )
}
