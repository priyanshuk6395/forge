import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Toast, type ToastType } from './Toast'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

const ToastContext = createContext<{ toast: (message: string, type?: ToastType) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof window.setTimeout>>())

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current.clear()
  }, [])

  const dismiss = (id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((item) => item.id !== id))
  }

  const toast = (message: string, type: ToastType = 'default') => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, message, type }])
    if (type === 'critical') return
    const duration = type === 'error' || type === 'warning' ? 8000 : 5000
    const timer = window.setTimeout(() => {
      timers.current.delete(id)
      setToasts((current) => current.filter((item) => item.id !== id))
    }, duration)
    timers.current.set(id, timer)
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-viewport" aria-label="Notifications">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            message={t.message}
            type={t.type}
            onClose={() => dismiss(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

export function Toaster() {
  return null
}