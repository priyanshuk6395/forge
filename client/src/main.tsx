// client/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/api/client'
import { ToastProvider } from '@/components/ui/Toaster'
import './index.css'
import App from './App.tsx'

function initTheme() {
  try {
    const saved = localStorage.getItem('forge-theme')
    const theme =
      saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    document.documentElement.classList.toggle('light', theme === 'light')
  } catch {
    // ignore storage errors
  }
}

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)