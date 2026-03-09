import { useState, useMemo } from 'react'

/**
 * usePagination - Hook para paginar una lista de datos.
 * @param data Lista de datos a paginar
 * @param pageSize Tamaño de página (default 10)
 */
export function usePagination<T>(data: T[], pageSize = 10) {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(data.length / pageSize)

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, page, pageSize])

  const nextPage = () => setPage((p) => Math.min(p + 1, totalPages))
  const prevPage = () => setPage((p) => Math.max(p - 1, 1))
  const goToPage = (n: number) => setPage(Math.max(1, Math.min(n, totalPages)))

  return { page, totalPages, paginated, nextPage, prevPage, goToPage, setPage }
}
