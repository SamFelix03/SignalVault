'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from '@/components/layout/sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { PageHeaderProvider } from '@/components/layout/page-header-context'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <PageHeaderProvider>
      <div className="flex min-h-screen">
        <div className="hidden md:block">
          <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[260px] p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar
              collapsed={false}
              onCollapsedChange={() => {}}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div
          className={cn(
            'flex min-h-screen flex-1 flex-col transition-all duration-300 ease-out',
            collapsed ? 'md:ml-[72px]' : 'md:ml-[260px]'
          )}
        >
          <div className="flex h-16 items-center border-b border-border px-4 md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <span className="ml-2 text-lg font-semibold">SignalVault</span>
          </div>

          <AppHeader />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </PageHeaderProvider>
  )
}
