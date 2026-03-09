import type { Event, Facility, Ministry, Reservation } from '../types'
import Panel from './Panel'

type DashboardSummaryProps = {
  ministriesCount: number
  peopleCount: number
  participationTotal: number
  upcomingEvents: Event[]
  pendingReservations: Reservation[]
  facilitiesCount: number
  reservationByEventId: Map<number, Reservation>
  facilitiesById: Map<number, Facility>
  ministriesById: Map<number, Ministry>
  eventsWithoutReservation: Event[]
  onNavigate: (section: 'calendario' | 'ministerios' | 'voluntarios' | 'mapa') => void
}

const DashboardSummary = ({
  ministriesCount,
  peopleCount,
  participationTotal,
  upcomingEvents,
  pendingReservations,
  facilitiesCount,
  reservationByEventId,
  facilitiesById,
  ministriesById,
  eventsWithoutReservation,
  onNavigate,
}: DashboardSummaryProps) => (
  <>
    <section className="grid">
      <div className="card">
        <span className="demo-label">Ministerios</span>
        <strong className="demo-value">{ministriesCount}</strong>
        <span className="demo-meta">Áreas registradas</span>
      </div>
      <div className="card">
        <span className="demo-label">Personas</span>
        <strong className="demo-value">{peopleCount}</strong>
        <span className="demo-meta">Miembros activos</span>
      </div>
      <div className="card">
        <span className="demo-label">Participación</span>
        <strong className="demo-value">{participationTotal}</strong>
        <span className="demo-meta">Activos esta semana</span>
      </div>
      <div className="card">
        <span className="demo-label">Eventos próximos</span>
        <strong className="demo-value">{upcomingEvents.length}</strong>
        <span className="demo-meta">Próximos 7 días</span>
      </div>
      <div className="card">
        <span className="demo-label">Reservas pendientes</span>
        <strong className="demo-value">{pendingReservations.length}</strong>
        <span className="demo-meta">Por confirmar</span>
      </div>
      <div className="card">
        <span className="demo-label">Espacios</span>
        <strong className="demo-value">{facilitiesCount}</strong>
        <span className="demo-meta">Disponibles</span>
      </div>
    </section>

    <section className="section-grid">
      <Panel title="Próximos 7 días" subtitle="Eventos programados con lugar y hora.">
        {upcomingEvents.length === 0 ? (
          <div className="table-row loading">Sin eventos próximos.</div>
        ) : (
          <ul className="demo-list">
            {upcomingEvents.map((event) => {
              const reservation = reservationByEventId.get(event.id)
              const place = reservation
                ? facilitiesById.get(reservation.facility_id)?.name ?? 'Sin lugar'
                : 'Sin lugar'
              const ministry = event.ministry_id
                ? ministriesById.get(event.ministry_id)?.name ?? 'Ministerio'
                : 'Sin ministerio'
              const timeLabel = reservation?.inicio
                ? reservation.inicio.split('T')[1]?.slice(0, 5) ?? ''
                : ''
              return (
                <li key={`upcoming-${event.id}`}>
                  <span>{event.name}</span>
                  <span className="demo-meta">
                    {event.date} · {ministry} · {place} {timeLabel ? `· ${timeLabel}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Pendientes" subtitle="Reservas por confirmar y eventos sin espacio.">
        <ul className="demo-list">
          {pendingReservations.slice(0, 4).map((reservation) => (
            <li key={`pending-${reservation.id}`}>
              <span>Reserva pendiente</span>
              <span className="demo-meta">
                {facilitiesById.get(reservation.facility_id)?.name ?? 'Espacio'} ·{' '}
                {reservation.inicio ? reservation.inicio.split('T')[0] : 'Sin fecha'}
              </span>
            </li>
          ))}
          {eventsWithoutReservation.slice(0, 3).map((event) => (
            <li key={`no-reservation-${event.id}`}>
              <span>Evento sin espacio</span>
              <span className="demo-meta">
                {event.name} · {event.date ?? 'Sin fecha'}
              </span>
            </li>
          ))}
          {pendingReservations.length === 0 && eventsWithoutReservation.length === 0 && (
            <li>
              <span>Sin pendientes críticos</span>
              <span className="demo-meta">Todo al día</span>
            </li>
          )}
        </ul>
      </Panel>

      <Panel title="Accesos rápidos" subtitle="Ir directo a módulos clave.">
        <div className="form-actions">
          <button className="primary" type="button" onClick={() => onNavigate('calendario')}>
            Crear evento / reserva
          </button>
          <button className="action-button" type="button" onClick={() => onNavigate('ministerios')}>
            Gestionar ministerios
          </button>
          <button className="action-button" type="button" onClick={() => onNavigate('voluntarios')}>
            Ver voluntarios
          </button>
          <button className="action-button" type="button" onClick={() => onNavigate('mapa')}>
            Mapa de iglesia
          </button>
        </div>
      </Panel>
    </section>
  </>
)

export default DashboardSummary
