'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Activity,
  BarChart3,
  Rocket,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface SidebarProps {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onNavigate?: () => void
}

const navItems = [
  { href: '/', label: 'Leaderboard', icon: BarChart3, exact: true },
  { href: '/deploy', label: 'Deploy Vault', icon: Rocket, exact: false },
  { href: '/follow', label: 'Follow Dashboard', icon: LayoutDashboard, exact: false },
]

export function Sidebar({ collapsed, onCollapsedChange, onNavigate }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-out',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <Link href="/" className="flex items-center gap-3" onClick={onNavigate}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white">
            <Activity className="h-5 w-5 text-accent-foreground" />
          </div>
          <span
            className={cn(
              'whitespace-nowrap text-lg font-semibold text-sidebar-foreground transition-all duration-300',
              collapsed ? 'w-0 overflow-hidden opacity-0' : 'w-auto opacity-100'
            )}
          >
            SignalVault
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-hidden px-3 py-4">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <span
                className={cn(
                  'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-all duration-300',
                  isActive ? 'opacity-100' : 'opacity-0'
                )}
              />
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0 transition-transform duration-200',
                  isActive ? 'text-accent' : 'group-hover:scale-110'
                )}
              />
              <span
                className={cn(
                  'whitespace-nowrap transition-all duration-300',
                  collapsed ? 'w-0 overflow-hidden opacity-0' : 'opacity-100'
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
