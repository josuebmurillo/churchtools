import type { Column } from '../types'

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

const DataTable = ({
  columns,
  rows,
  loading,
  emptyMessage,
}: {
  columns: Column[]
  rows: Record<string, unknown>[]
  loading?: boolean
  emptyMessage?: string
}) => (
  <div className="module-table">
    <div className="module-table__inner">
      <div className="table-header">
        {columns.map((col) => (
          <span key={`header-${col.key}`}>{col.label ?? col.key}</span>
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
              <span key={`${col.key}-${index}`}>{formatValue(row[col.key])}</span>
            ))}
          </div>
        ))
      )}
    </div>
  </div>
)

export default DataTable
