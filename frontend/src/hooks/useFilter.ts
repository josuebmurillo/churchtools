import { useState, useMemo } from 'react'

/**
 * useFilter - Hook para filtrar una lista de datos por un campo y valor.
 * @param data Lista de datos a filtrar
 * @param field Campo a filtrar (string)
 * @param initialValue Valor inicial del filtro
 */
export function useFilter<T>(data: T[], field: keyof T, initialValue = '') {
  const [filter, setFilter] = useState(initialValue)

  const filtered = useMemo(() => {
    if (!filter) return data
    return data.filter((item) => String(item[field]).toLowerCase().includes(String(filter).toLowerCase()))
  }, [data, field, filter])

  return { filter, setFilter, filtered }
}
