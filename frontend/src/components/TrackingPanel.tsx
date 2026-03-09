import { Bar, Doughnut } from 'react-chartjs-2'
import type { ChartData } from 'chart.js'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import GenericTable from './GenericTable'
import Panel from './Panel'

type TrackingRow = {
  name: string
  ministry: string
  team: string
  role: string
  courses: string
  status: string
  gender: string
  age: number | string
  marital_status: string
  phone: string
  email: string
  detail_action?: string
}

type TrackingPanelProps = {
  demographicTotal: number
  serversCount: number
  genderDoughnut: ChartData<'doughnut', number[], unknown>
  agePyramid: ChartData<'bar', number[], unknown>
  maritalDoughnut: ChartData<'doughnut', number[], unknown>
  maritalHasData: boolean
  trackingSearch: string
  setTrackingSearch: (value: string) => void
  filteredTrackingRows: Record<string, unknown>[]
  peopleLoading: boolean
  teamMembersLoading: boolean
  peopleError?: string | null
}

const TrackingPanel = ({
  demographicTotal,
  serversCount,
  genderDoughnut,
  agePyramid,
  maritalDoughnut,
  maritalHasData,
  trackingSearch,
  setTrackingSearch,
  filteredTrackingRows,
  peopleLoading,
  teamMembersLoading,
  peopleError,
}: TrackingPanelProps) => {
  const [selectedRow, setSelectedRow] = useState<TrackingRow | null>(null)
  const [floatingPosition, setFloatingPosition] = useState<{ top: number; left: number } | null>(
    null,
  )
  const [isLargeScreen, setIsLargeScreen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  )
  const trackingLayoutRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const updateSize = () => setIsLargeScreen(mediaQuery.matches)
    updateSize()

    mediaQuery.addEventListener('change', updateSize)
    return () => mediaQuery.removeEventListener('change', updateSize)
  }, [])

  const rows = useMemo(() => filteredTrackingRows as TrackingRow[], [filteredTrackingRows])
  const doughnutLegendPosition = isLargeScreen ? 'right' : 'bottom'

  const openDetailCard = (row: TrackingRow, event: MouseEvent<HTMLButtonElement>) => {
    const layoutRect = trackingLayoutRef.current?.getBoundingClientRect()
    const buttonRect = event.currentTarget.getBoundingClientRect()

    if (layoutRect) {
      const cardWidth = 420
      const estimatedCardHeight = 340
      const horizontalPadding = 8
      const verticalPadding = 8
      const belowTop = buttonRect.bottom - layoutRect.top + verticalPadding
      const aboveTop = buttonRect.top - layoutRect.top - estimatedCardHeight - verticalPadding
      const spaceBelow = layoutRect.bottom - buttonRect.bottom
      const spaceAbove = buttonRect.top - layoutRect.top
      const preferredTop =
        spaceBelow >= estimatedCardHeight || spaceBelow >= spaceAbove ? belowTop : aboveTop
      const preferredLeft = buttonRect.left - layoutRect.left
      const maxLeft = Math.max(horizontalPadding, layoutRect.width - cardWidth - horizontalPadding)
      const maxTop = Math.max(
        verticalPadding,
        layoutRect.height - estimatedCardHeight - verticalPadding,
      )

      setFloatingPosition({
        top: Math.min(Math.max(verticalPadding, preferredTop), maxTop),
        left: Math.min(Math.max(horizontalPadding, preferredLeft), maxLeft),
      })
    }

    setSelectedRow(row)
  }

  return (
    <section className="section-grid">
      <Panel title="Seguimiento de miembros" subtitle="Consulta estado, perfil y participación de cada persona." className="module-panel--full">
      <div className="demo-dashboard">
        <div className="demo-card">
          <span className="demo-label">Total miembros</span>
          <strong className="demo-value">{demographicTotal}</strong>
          <span className="demo-meta">Servidores activos: {serversCount}</span>
        </div>
        <div className="demo-card demo-card--donut">
          <span className="demo-label">Sexo</span>
          <div className="demo-chart">
            <Doughnut
              data={genderDoughnut}
              options={{
                plugins: { legend: { position: doughnutLegendPosition, labels: { color: '#64748b' } } },
                cutout: '65%',
              }}
            />
          </div>
        </div>
        <div className="demo-card">
          <span className="demo-label">Rangos de edad</span>
          <div className="demo-chart demo-chart--tall">
            <Bar
              data={agePyramid}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      color: '#64748b',
                      boxWidth: 10,
                      boxHeight: 10,
                      padding: 10,
                      font: { size: 11 },
                    },
                  },
                },
                scales: {
                  x: {
                    ticks: {
                      color: '#64748b',
                      maxTicksLimit: 5,
                      callback: (value) => Math.abs(Number(value)).toString(),
                    },
                    grid: { color: 'rgba(148, 163, 184, 0.25)' },
                  },
                  y: {
                    ticks: {
                      color: '#64748b',
                      font: { size: 11 },
                    },
                    grid: { display: false },
                  },
                },
              }}
            />
          </div>
        </div>
        <div className="demo-card demo-card--donut">
          <span className="demo-label">Estado civil</span>
          {maritalHasData ? (
            <div className="demo-chart">
              <Doughnut
                data={maritalDoughnut}
                options={{
                  plugins: { legend: { position: doughnutLegendPosition, labels: { color: '#64748b' } } },
                  cutout: '65%',
                }}
              />
            </div>
          ) : (
            <span className="demo-meta">Sin datos disponibles</span>
          )}
        </div>
      </div>
      <label className="field">
        Buscar persona
        <input
          className="input"
          value={trackingSearch}
          onChange={(event) => setTrackingSearch(event.target.value)}
          placeholder="Nombre, correo, teléfono, ministerio, equipo o rol"
        />
      </label>
      <div className="tracking-layout" ref={trackingLayoutRef}>
        <GenericTable
          columns={[
            { key: 'name', label: 'Nombre' },
            { key: 'ministry', label: 'Ministerio' },
            { key: 'team', label: 'Equipo' },
            { key: 'role', label: 'Rol' },
            {
              key: 'detail_action',
              label: 'Detalle',
              render: (_, row) => (
                <button
                  className="action-button ghost"
                  type="button"
                  onClick={(event) => openDetailCard(row, event)}
                >
                  Ver ficha
                </button>
              ),
            },
          ]}
          rows={rows}
          loading={peopleLoading || teamMembersLoading}
          emptyMessage={peopleError ?? 'No se encontraron coincidencias.'}
        />

        {selectedRow && (
          <aside
            className="tracking-floating-card"
            style={
              floatingPosition
                ? { top: `${floatingPosition.top}px`, left: `${floatingPosition.left}px` }
                : undefined
            }
          >
            <div className="tracking-floating-card__header">
              <h3>{selectedRow.name}</h3>
              <button
                className="action-button ghost"
                type="button"
                onClick={() => {
                  setSelectedRow(null)
                  setFloatingPosition(null)
                }}
              >
                Cerrar
              </button>
            </div>
            <div className="module-table">
              <div className="table-row">
                <span>Estado</span>
                <span>{selectedRow.status}</span>
              </div>
              <div className="table-row">
                <span>Sexo</span>
                <span>{selectedRow.gender}</span>
              </div>
              <div className="table-row">
                <span>Edad</span>
                <span>{selectedRow.age}</span>
              </div>
              <div className="table-row">
                <span>Estado civil</span>
                <span>{selectedRow.marital_status}</span>
              </div>
              <div className="table-row">
                <span>Teléfono</span>
                <span>{selectedRow.phone}</span>
              </div>
              <div className="table-row">
                <span>Correo</span>
                <span>{selectedRow.email}</span>
              </div>
              <div className="table-row">
                <span>Cursos</span>
                <span>
                  {selectedRow.courses === 'Sin cursos asignados' ? (
                    'Sin cursos asignados'
                  ) : (
                    <ul className="tracking-course-list">
                      {selectedRow.courses
                        .split(',')
                        .map((course) => course.trim())
                        .filter(Boolean)
                        .map((course) => (
                          <li key={`course-${selectedRow.name}-${course}`}>{course}</li>
                        ))}
                    </ul>
                  )}
                </span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </Panel>
  </section>
  )
}

export default TrackingPanel
