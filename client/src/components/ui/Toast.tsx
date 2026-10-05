import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'default' | 'success' | 'error' | 'info' | 'warning' | 'critical'

export interface ToastProps {
  message: string
  type?: ToastType
  onClose: () => void
}

export function Toast({ message, type = 'default', onClose }: ToastProps) {
  const Icon = type === 'success' ? CheckCircle2 : type === 'warning' ? AlertTriangle : type === 'error' || type === 'critical' ? CircleAlert : Info
  return (
    <div
      className={cn(
        'toast animate-in slide-in-from-right',
        `toast-${type}`
      )}
      role={type === 'error' || type === 'critical' ? 'alert' : 'status'}
      aria-live={type === 'error' || type === 'critical' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <Icon aria-hidden="true" />
      <p>{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="toast-dismiss"
        aria-label="Dismiss notification"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  )
}