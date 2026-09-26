import * as React from 'react'
import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-[var(--surface-raised)]',
        'bg-gradient-to-r from-[var(--surface-raised)] via-[var(--border)] to-[var(--surface-raised)] bg-[length:400%_100%]',
        className
      )}
      {...props}
    />
  )
}

export function SkeletonLine({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Skeleton
      className={cn('h-3 w-full', className)}
      {...props}
    />
  )
}