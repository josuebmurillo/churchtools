import { useEffect, useState } from 'react'
import { fetchJson } from '../services/api'

export type DataState<T> = {
  data: T
  loading: boolean
  error?: string | null
  refresh: () => void
}

export const useApiData = <T,>(url: string, initial: T): DataState<T> => {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)

  useEffect(() => {
    let mounted = true
    fetchJson<T>(url)
      .then((payload) => {
        if (!mounted) return
        // Si el payload no es un array, usa el valor inicial (por defecto [])
        if (Array.isArray(payload)) {
          setData(payload as T)
        } else if (payload === undefined || payload === null) {
          setData(initial)
        } else {
          setData(payload)
        }
        setError(null)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Error consultando API')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [url, refreshIndex])

  return {
    data,
    loading,
    error,
    refresh: () => {
      setLoading(true)
      setRefreshIndex((prev) => prev + 1)
    },
  }
}
