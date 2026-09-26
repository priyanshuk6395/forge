import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, id, ...props }, ref) => {
    const switchId = id || props.name
    return (
      <label className={cn('inline-flex items-center gap-3 cursor-pointer', className)}>
        <input
          ref={ref}
          type="checkbox"
          id={switchId}
          className={cn(
            'sr-only',
            'peer',
            'focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]'
          )}
          {...props}
        />
        <span
          className={cn(
            'relative w-8 h-5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)]',
            'transition-colors duration-120',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-strong)] peer-focus-visible:ring-offset-2',
            'peer-checked:border-[var(--accent)] peer-checked:bg-[color-mix(in_srgb,_var(--accent)_35%,_var(--surface-raised))]'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--text-muted)]',
              'transition-all duration-120',
              'peer-checked:translate-x-6 peer-checked:bg-[var(--accent-strong)]'
            )}
          />
        </span>
        {label && <span className="text-sm text-[var(--text-secondary)]">{label}</span>}
      </label>
    )
  }
)
Switch.displayName = 'Switch'