import type { ReactNode } from 'react'

export type GenericColumn<T> = {
  key: keyof T
  label?: string
  render?: (value: T[keyof T], row: T) => ReactNode
}

export type GenericTableProps<T> = {
  columns: GenericColumn<T>[]
  rows: T[]
  loading?: boolean
  emptyMessage?: string
  className?: string
}

function GenericTable<T extends object>({
  columns,
  rows,
  loading,
  emptyMessage,
  className = '',
}: GenericTableProps<T>) {
  return (
    <div className={`module-table ${className}`} style={{ position: 'relative' }}>
      <div className="module-table__inner">
        <div className="table-header" style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: 'var(--bg)',
          paddingBlock: '6px 4px',
          marginBottom: 4,
        }}>
          {columns.map((col) => (
            <span key={`header-${String(col.key)}`} style={{ fontWeight: 600 }}>
              {col.label ?? String(col.key)}
            </span>
          ))}
        </div>
        {loading ? (
          <div className="table-row loading">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="table-row loading">{emptyMessage ?? 'Sin datos'}</div>
        ) : (
          rows.map((row, index) => (
            <div className="table-row" key={`row-${index}`}>
              {columns.map((col) => (
                <span key={`${String(col.key)}-${index}`} style={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {col.render
                    ? col.render(row[col.key], row)
                    : (typeof row[col.key] === 'string' ||
                       typeof row[col.key] === 'number' ||
                       typeof row[col.key] === 'boolean' ||
                       row[col.key] === null ||
                       row[col.key] === undefined)
                      ? (row[col.key] ?? '—').toString()
                      : '—'}
                </span>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default GenericTable
