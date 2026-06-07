'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface PageHeaderContextValue {
  title: string | null
  setTitle: (title: string | null) => void
  search: string
  setSearch: (search: string) => void
  showSearch: boolean
  setShowSearch: (show: boolean) => void
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null)

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  return (
    <PageHeaderContext.Provider
      value={{ title, setTitle, search, setSearch, showSearch, setShowSearch }}
    >
      {children}
    </PageHeaderContext.Provider>
  )
}

export function usePageHeader() {
  const ctx = useContext(PageHeaderContext)
  if (!ctx) throw new Error('usePageHeader must be used within PageHeaderProvider')
  return ctx
}
