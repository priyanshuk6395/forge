import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
      refetchOnReconnect: true,
    },
  },
})

const API_BASE = '/api'

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    headers: {
      'X-Forge-Client': '1',
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const error = new Error((data as any)?.error || `Request failed (${res.status})`)
    ;(error as any).status = res.status
    throw error
  }

  return data as T
}

export const api = {
  get: <T>(path: string) => fetchJson<T>(path),
  post: <T>(path: string, body: unknown) => fetchJson<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => fetchJson<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => fetchJson<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) => fetchJson<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
}