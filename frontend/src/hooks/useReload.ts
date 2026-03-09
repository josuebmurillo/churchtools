import { useState, useCallback } from 'react'

/**
 * useReload - Hook para forzar recarga de datos (trigger manual).
 */
export function useReload() {
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { reloadKey, reload }
}
