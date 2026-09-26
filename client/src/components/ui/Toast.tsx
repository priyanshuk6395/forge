import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ToastProps {
  message: string
  type?: 'default' | 'success' | 'error'
  onClose: () => void
}

export function Toast({ message, type = 'default', onClose }: ToastProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border max-w-sm shadow-lg animate-in slide-in-from-right',
        type === 'error' && 'border-red-500 bg-red-900/30 text-red-300',
        type === 'success' && 'border-green-500 bg-green-900/30 text-green-300',
        type === 'default' && 'border-gray-600 bg-gray-800 text-gray-100'
      )}
      role="alert"
    >
      <div className="flex-1 text-sm">{message}</div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-200 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}