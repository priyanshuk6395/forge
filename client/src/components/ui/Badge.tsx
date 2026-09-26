import * as React from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'neutral'
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'neutral', children, ...props }, ref) => {
    const variantClasses = {
      success: 'bg-[color-mix(in_srgb,_var(--success)_40%,_transparent)] text-[var(--success)] border-[color-mix(in_srgb,_var(--success)_40%,_transparent)]',
      warning: 'bg-[color-mix(in_srgb,_var(--warning)_40%,_transparent)] text-[var(--warning)] border-[color-mix(in_srgb,_var(--warning)_40%,_transparent)]',
      danger: 'bg-[color-mix(in_srgb,_var(--danger)_40%,_transparent)] text-[var(--danger)] border-[color-mix(in_srgb,_var(--danger)_40%,_transparent)]',
      neutral: 'bg-[var(--surface-raised)] text-[var(--text-muted)] border-[var(--border)]',
    }
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full text-xs font-semibold px-2.5 py-0.5 border',
          variantClasses[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
Badge.displayName = 'Badge'