import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle'
  size?: 'sm' | 'md' | 'lg'
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:opacity-50 disabled:pointer-events-none',
          {
            'bg-[var(--accent)] text-[#0d1216] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)] border border-[var(--accent)]': variant === 'primary',
            'bg-transparent border-transparent hover:bg-[var(--surface-raised)]': variant === 'ghost',
            'bg-transparent border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-[#1b1f24]': variant === 'danger',
            'bg-[var(--surface-raised)] text-[var(--text)] hover:bg-[var(--border)] border border-[var(--border)]': variant === 'subtle',
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-4 py-2 text-base': size === 'md',
            'px-6 py-3 text-lg': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'
export { Button }