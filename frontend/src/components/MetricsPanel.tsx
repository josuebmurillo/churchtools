import { useEffect, useState } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import GenericTable from './GenericTable'
import Panel from './Panel'
import type { ParticipationSnapshot } from '../types'
import type { ChartData, ChartOptions } from 'chart.js'

type MetricsPanelProps = {
  teamMembersCount: number
  volunteersByMinistrySize: number
  rolesAverage: number
  volunteersByMinistryChart: ChartData<'bar', number[], unknown>
  demographicTotal: number
  serversCount: number
  genderDoughnut: ChartData<'doughnut', number[], unknown>
  agePyramid: ChartData<'bar', number[], unknown>
  maritalDoughnut: ChartData<'doughnut', number[], unknown>
  maritalHasData: boolean
  participationHistory: {
    data: ParticipationSnapshot[]
    loading: boolean
    error?: string | null
  }
  participationChart: ChartData<'line', number[], unknown>
  chartOptions: ChartOptions<'line'>
  participationTotals: {
    total_activos: number
    total_voluntarios: number
  }
}

const MetricsPanel = ({
  teamMembersCount,
  volunteersByMinistrySize,
  rolesAverage,
  volunteersByMinistryChart,
  demographicTotal,
  serversCount,
  genderDoughnut,
  agePyramid,
  maritalDoughnut,
  maritalHasData,
  participationHistory,
  participationChart,
  chartOptions,
  participationTotals,
}: MetricsPanelProps) => {
  const [isLargeScreen, setIsLargeScreen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const updateSize = () => setIsLargeScreen(mediaQuery.matches)
    updateSize()

    mediaQuery.addEventListener('change', updateSize)
    return () => mediaQuery.removeEventListener('change', updateSize)
  }, [])

  const doughnutLegendPosition = isLargeScreen ? 'right' : 'bottom'

  return (
    <section className="section-grid">
    <Panel title="Métricas de voluntariado" subtitle="Resumen operativo de equipos, ministerios y roles." className="module-panel--full">
      <div className="mini-dashboard">
        <div className="mini-card">
          <span className="mini-label">Voluntarios activos</span>
          <strong className="mini-value">{teamMembersCount}</strong>
          <span className="mini-meta">Miembros asignados a equipos</span>
        </div>
        <div className="mini-card">
          <span className="mini-label">Ministerios con voluntarios</span>
          <strong className="mini-value">{volunteersByMinistrySize}</strong>
          <span className="mini-meta">Ministerios con equipos activos</span>
        </div>
        <div className="mini-card">
          <span className="mini-label">Roles por ministerio</span>
          <strong className="mini-value">{rolesAverage}</strong>
          <span className="mini-meta">Promedio de roles registrados</span>
        </div>
        <div className="mini-card mini-card--wide">
          <span className="mini-label">Miembros por ministerio</span>
          <div className="mini-chart">
            <Bar
              data={volunteersByMinistryChart}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                },
                scales: {
                  x: {
                    ticks: { color: '#6b7280', maxRotation: 0, autoSkip: true },
                    grid: { display: false },
                  },
                  y: {
                    ticks: { color: '#6b7280' },
                    grid: { color: 'rgba(148, 163, 184, 0.3)' },
                  },
                },
              }}
            />
          </div>
        </div>
      </div>
    </Panel>

    <Panel title="Métricas demográficas" subtitle="Composición de miembros por sexo, edad y estado civil." className="module-panel--full">
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
                  plugins: {
                    legend: { position: doughnutLegendPosition, labels: { color: '#64748b' } },
                  },
                  cutout: '65%',
                }}
              />
            </div>
          ) : (
            <span className="demo-meta">Sin datos disponibles</span>
          )}
        </div>
      </div>
    </Panel>

    <Panel title="Participación por fecha" subtitle="Visitas y servidores a lo largo del tiempo.">
      <div className="chart-card">
        {participationHistory.loading ? (
          <div className="table-row loading">Cargando métricas...</div>
        ) : participationHistory.data.length === 0 ? (
          <div className="table-row loading">
            {participationHistory.error ?? 'No hay datos históricos disponibles.'}
          </div>
        ) : (
          <Line data={participationChart} options={chartOptions} />
        )}
      </div>
      <GenericTable
        columns={[
          { key: 'fecha', label: 'Fecha' },
          { key: 'total_activos', label: 'Visitas' },
          { key: 'total_voluntarios', label: 'Servidores' },
        ]}
        rows={participationHistory.data}
        loading={participationHistory.loading}
        emptyMessage={participationHistory.error ?? 'No hay participación registrada.'}
      />
    </Panel>

    <div className="card">
      <div className="card-header">
        <h3>Último corte</h3>
      </div>
      <div className="detail">Visitas</div>
      <strong>{participationTotals.total_activos}</strong>
      <div className="detail">Servidores</div>
      <strong>{participationTotals.total_voluntarios}</strong>
    </div>
  </section>
  )
}

export default MetricsPanel
