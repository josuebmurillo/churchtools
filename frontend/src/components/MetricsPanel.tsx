import { useEffect, useState, type FormEvent } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import GenericTable from './GenericTable'
import Panel from './Panel'
import type { AttendanceSnapshot, Event, ParticipationSnapshot } from '../types'
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
  attendanceHistory: {
    data: AttendanceSnapshot[]
    loading: boolean
    error?: string | null
  }
  participationChart: ChartData<'line', number[], unknown>
  chartOptions: ChartOptions<'line'>
  events: Event[]
  attendanceTotals: {
    total_asistencia: number
    total_visitantes: number
  }
  participationTotals: {
    total_activos: number
    total_voluntarios: number
  }
  onCreateAttendanceReport: (payload: { fecha: string; event_id: number | null; total_asistencia: number; total_visitantes: number }) => Promise<void>
  onCreateParticipationReport: (payload: { fecha: string; event_id: number | null; total_activos: number; total_voluntarios: number }) => Promise<void>
  onUpdateAttendanceReport: (id: number, payload: { fecha: string; event_id: number | null; total_asistencia: number; total_visitantes: number }) => Promise<void>
  onDeleteAttendanceReport: (id: number) => Promise<void>
  onUpdateParticipationReport: (id: number, payload: { fecha: string; event_id: number | null; total_activos: number; total_voluntarios: number }) => Promise<void>
  onDeleteParticipationReport: (id: number) => Promise<void>
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
  attendanceHistory,
  participationChart,
  chartOptions,
  events,
  attendanceTotals,
  participationTotals,
  onCreateAttendanceReport,
  onCreateParticipationReport,
  onUpdateAttendanceReport,
  onDeleteAttendanceReport,
  onUpdateParticipationReport,
  onDeleteParticipationReport,
}: MetricsPanelProps) => {
  const [isLargeScreen, setIsLargeScreen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  )
  const [attendanceForm, setAttendanceForm] = useState({ fecha: new Date().toISOString().slice(0, 10), event_id: '', total_asistencia: '', total_visitantes: '' })
  const [participationForm, setParticipationForm] = useState({ fecha: new Date().toISOString().slice(0, 10), event_id: '', total_activos: '', total_voluntarios: '' })
  const [attendanceSubmitting, setAttendanceSubmitting] = useState(false)
  const [participationSubmitting, setParticipationSubmitting] = useState(false)
  const [editingAttendanceId, setEditingAttendanceId] = useState<number | null>(null)
  const [editingParticipationId, setEditingParticipationId] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const updateSize = () => setIsLargeScreen(mediaQuery.matches)
    updateSize()

    mediaQuery.addEventListener('change', updateSize)
    return () => mediaQuery.removeEventListener('change', updateSize)
  }, [])

  const doughnutLegendPosition = isLargeScreen ? 'right' : 'bottom'

  const handleAttendanceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAttendanceSubmitting(true)
    try {
      const payload = {
        fecha: attendanceForm.fecha,
        event_id: attendanceForm.event_id ? Number(attendanceForm.event_id) : null,
        total_asistencia: Number(attendanceForm.total_asistencia || 0),
        total_visitantes: Number(attendanceForm.total_visitantes || 0),
      }
      if (editingAttendanceId) {
        await onUpdateAttendanceReport(editingAttendanceId, payload)
      } else {
        await onCreateAttendanceReport(payload)
      }
      setEditingAttendanceId(null)
      setAttendanceForm({ fecha: new Date().toISOString().slice(0, 10), event_id: '', total_asistencia: '', total_visitantes: '' })
    } finally {
      setAttendanceSubmitting(false)
    }
  }

  const handleParticipationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setParticipationSubmitting(true)
    try {
      const payload = {
        fecha: participationForm.fecha,
        event_id: participationForm.event_id ? Number(participationForm.event_id) : null,
        total_activos: Number(participationForm.total_activos || 0),
        total_voluntarios: Number(participationForm.total_voluntarios || 0),
      }
      if (editingParticipationId) {
        await onUpdateParticipationReport(editingParticipationId, payload)
      } else {
        await onCreateParticipationReport(payload)
      }
      setEditingParticipationId(null)
      setParticipationForm({ fecha: new Date().toISOString().slice(0, 10), event_id: '', total_activos: '', total_voluntarios: '' })
    } finally {
      setParticipationSubmitting(false)
    }
  }

  return (
    <section className="section-grid">
    <Panel title="Registrar reportes" subtitle="Ingresa reportes manuales y asócialos a un evento cuando aplique." className="module-panel--full">
      <div className="section-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <form className="form" onSubmit={handleAttendanceSubmit}>
          <label className="field">
            Fecha
            <input className="input" type="date" value={attendanceForm.fecha} onChange={(event) => setAttendanceForm({ ...attendanceForm, fecha: event.target.value })} required />
          </label>
          <label className="field">
            Evento asociado
            <select className="input" value={attendanceForm.event_id} onChange={(event) => setAttendanceForm({ ...attendanceForm, event_id: event.target.value })}>
              <option value="">Sin evento asociado</option>
              {events.map((item) => (
                <option key={`attendance-event-${item.id}`} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Asistencia total
            <input className="input" type="number" min="0" value={attendanceForm.total_asistencia} onChange={(event) => setAttendanceForm({ ...attendanceForm, total_asistencia: event.target.value })} required />
          </label>
          <label className="field">
            Visitantes
            <input className="input" type="number" min="0" value={attendanceForm.total_visitantes} onChange={(event) => setAttendanceForm({ ...attendanceForm, total_visitantes: event.target.value })} required />
          </label>
          <div className="row-actions">
            <button className="primary" type="submit" disabled={attendanceSubmitting}>{attendanceSubmitting ? 'Guardando…' : editingAttendanceId ? 'Actualizar asistencia' : 'Guardar asistencia'}</button>
            {editingAttendanceId && (
              <button className="action-button ghost" type="button" onClick={() => {
                setEditingAttendanceId(null)
                setAttendanceForm({ fecha: new Date().toISOString().slice(0, 10), event_id: '', total_asistencia: '', total_visitantes: '' })
              }}>
                Cancelar edición
              </button>
            )}
          </div>
        </form>

        <form className="form" onSubmit={handleParticipationSubmit}>
          <label className="field">
            Fecha
            <input className="input" type="date" value={participationForm.fecha} onChange={(event) => setParticipationForm({ ...participationForm, fecha: event.target.value })} required />
          </label>
          <label className="field">
            Evento asociado
            <select className="input" value={participationForm.event_id} onChange={(event) => setParticipationForm({ ...participationForm, event_id: event.target.value })}>
              <option value="">Sin evento asociado</option>
              {events.map((item) => (
                <option key={`participation-event-${item.id}`} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Visitas
            <input className="input" type="number" min="0" value={participationForm.total_activos} onChange={(event) => setParticipationForm({ ...participationForm, total_activos: event.target.value })} required />
          </label>
          <label className="field">
            Servidores
            <input className="input" type="number" min="0" value={participationForm.total_voluntarios} onChange={(event) => setParticipationForm({ ...participationForm, total_voluntarios: event.target.value })} required />
          </label>
          <div className="row-actions">
            <button className="primary" type="submit" disabled={participationSubmitting}>{participationSubmitting ? 'Guardando…' : editingParticipationId ? 'Actualizar participación' : 'Guardar participación'}</button>
            {editingParticipationId && (
              <button className="action-button ghost" type="button" onClick={() => {
                setEditingParticipationId(null)
                setParticipationForm({ fecha: new Date().toISOString().slice(0, 10), event_id: '', total_activos: '', total_voluntarios: '' })
              }}>
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </div>
    </Panel>

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

    <Panel title="Asistencia registrada" subtitle="Asistencia y visitantes por fecha y evento.">
      <GenericTable
        className="metrics-attendance-table"
        columns={[
          { key: 'fecha', label: 'Fecha' },
          { key: 'event_name', label: 'Evento', render: (value) => value || 'Sin evento' },
          { key: 'total_asistencia', label: 'Asistencia' },
          { key: 'total_visitantes', label: 'Visitantes' },
          {
            key: 'id',
            label: 'Acciones',
            render: (_, row) => (
              <div className="row-actions">
                <button
                  className="action-button ghost"
                  type="button"
                  onClick={() => {
                    setEditingAttendanceId(row.id)
                    setAttendanceForm({
                      fecha: row.fecha,
                      event_id: row.event_id ? String(row.event_id) : '',
                      total_asistencia: String(row.total_asistencia),
                      total_visitantes: String(row.total_visitantes),
                    })
                  }}
                >
                  Editar
                </button>
                <button
                  className="action-button danger"
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('¿Eliminar este reporte de asistencia?')) return
                    await onDeleteAttendanceReport(row.id)
                    if (editingAttendanceId === row.id) {
                      setEditingAttendanceId(null)
                    }
                  }}
                >
                  Eliminar
                </button>
              </div>
            ),
          },
        ]}
        rows={attendanceHistory.data}
        loading={attendanceHistory.loading}
        emptyMessage={attendanceHistory.error ?? 'No hay asistencia registrada.'}
      />
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
        className="metrics-participation-table"
        columns={[
          { key: 'fecha', label: 'Fecha' },
          { key: 'event_name', label: 'Evento', render: (value) => value || 'Sin evento' },
          { key: 'total_activos', label: 'Visitas' },
          { key: 'total_voluntarios', label: 'Servidores' },
          {
            key: 'id',
            label: 'Acciones',
            render: (_, row) => (
              <div className="row-actions">
                <button
                  className="action-button ghost"
                  type="button"
                  onClick={() => {
                    setEditingParticipationId(row.id)
                    setParticipationForm({
                      fecha: row.fecha,
                      event_id: row.event_id ? String(row.event_id) : '',
                      total_activos: String(row.total_activos),
                      total_voluntarios: String(row.total_voluntarios),
                    })
                  }}
                >
                  Editar
                </button>
                <button
                  className="action-button danger"
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('¿Eliminar este reporte de participación?')) return
                    await onDeleteParticipationReport(row.id)
                    if (editingParticipationId === row.id) {
                      setEditingParticipationId(null)
                    }
                  }}
                >
                  Eliminar
                </button>
              </div>
            ),
          },
        ]}
        rows={participationHistory.data}
        loading={participationHistory.loading}
        emptyMessage={participationHistory.error ?? 'No hay participación registrada.'}
      />
    </Panel>

    <div className="card">
      <div className="card-header">
        <h3>Último corte de participación</h3>
      </div>
      <div className="detail">Visitas</div>
      <strong>{participationTotals.total_activos}</strong>
      <div className="detail">Servidores</div>
      <strong>{participationTotals.total_voluntarios}</strong>
    </div>

    <div className="card">
      <div className="card-header">
        <h3>Último corte de asistencia</h3>
      </div>
      <div className="detail">Asistencia</div>
      <strong>{attendanceTotals.total_asistencia}</strong>
      <div className="detail">Visitantes</div>
      <strong>{attendanceTotals.total_visitantes}</strong>
    </div>
  </section>
  )
}

export default MetricsPanel
