const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const buildUrl = (service: string, path: string) => `${API_BASE_URL}/${service}${path}`

// Token helpers
export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}
export function setAuthToken(token: string) {
  localStorage.setItem('auth_token', token)
}
export function clearAuthToken() {
  localStorage.removeItem('auth_token')
}

export const fetchJson = async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
  const token = getAuthToken()
  const headers = new Headers(options.headers || {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(url, { ...options, headers })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

export const postJson = async <T,>(url: string, payload: T) =>
  fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
