const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const buildUrl = (service: string, path: string) => `${API_BASE_URL}/${service}${path}`

export const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options)
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
