'use client'

import { Suspense } from 'react'
import { TokenPageContent } from './token-page-content'
import { LoadingSpinner } from '@/components/common/loading-spinner'

export default function TokenPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <TokenPageContent />
    </Suspense>
  )
}
