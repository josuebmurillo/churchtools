import { useMemo, useState } from 'react'
import GenericTable from '../components/GenericTable'
import VolunteersHeader from '../components/VolunteersHeader'
import VolunteersSidebar, { type VolunteersSection } from '../components/VolunteersSidebar'
import Panel from '../components/Panel'
import { useApiData } from '../hooks/useApiData'
import { buildUrl, getAllowedSections, getAuthUser } from '../services/api'
import type { Event, Shift, ShiftAssignment } from '../types'

type VolunteersAppProps = {
  onLogout: () => void
}

type ShiftAssignmentRow = ShiftAssignment & {
  event_name?: string
}

const VolunteersApp = ({ onLogout }: VolunteersAppProps) => {
  const currentUser = getAuthUser()
  const allowedSections = getAllowedSections('volunteers', currentUser?.permissions ?? []) as VolunteersSection[]
  const events = useApiData<Event[]>(buildUrl('events', '/events'), [])
  const shifts = useApiData<Shift[]>(buildUrl('volunteers', '/shifts'), [])
  const assignments = useApiData<ShiftAssignment[]>(buildUrl('volunteers', '/shift-assignments'), [])

  const [personFilter, setPersonFilter] = useState('')
  const [activeSection, setActiveSection] = useState<VolunteersSection>(allowedSections[0] ?? 'eventos')

  const eventsById = useMemo(() => {
    const map = new Map<number, Event>()
    events.data.forEach((event) => map.set(event.id, event))
    return map
  }, [events.data])

  const filteredAssignments = useMemo(() => {
    if (!personFilter) {
      return assignments.data
    }
    return assignments.data.filter((item) => String(item.person_id) === personFilter)
  }, [assignments.data, personFilter])

  const assignmentRows = useMemo<ShiftAssignmentRow[]>(
    () => filteredAssignments.map((item) => ({ ...item, event_name: '' })),
    [filteredAssignments]
  )

  return (
    <div className="app">
      <VolunteersSidebar
        activeSection={activeSection}
        visibleSections={allowedSections}
        setActiveSection={setActiveSection}
        onLogout={onLogout}
      />
      <main className="main">
        <VolunteersHeader />

        {allowedSections.length === 0 && (
          <Panel title="Sin acceso" subtitle="Tu usuario no tiene módulos asignados en Voluntarios.">
            Solicita a un administrador que te asigne permisos para esta vista.
          </Panel>
        )}

        {allowedSections.includes('asignaciones') && (
        <Panel title="Filtrar asignaciones" subtitle="Ingresa el ID de la persona para ver sus turnos asignados.">
          <div className="form inline">
            <input
              className="input"
              placeholder="ID de persona"
              value={personFilter}
              onChange={(event) => setPersonFilter(event.target.value)}
            />
          </div>
        </Panel>
        )}

        {allowedSections.includes('eventos') && activeSection === 'eventos' && (
          <Panel title="Eventos" subtitle="Consulta la agenda de eventos para planificar cobertura.">
            <GenericTable
              columns={[
                { key: 'id' },
                { key: 'name', label: 'Evento' },
                { key: 'date', label: 'Fecha' },
                { key: 'ministry_id', label: 'Ministerio' },
              ]}
              rows={events.data}
              loading={events.loading}
              emptyMessage={events.error ?? 'No hay eventos disponibles.'}
            />
          </Panel>
        )}

        {allowedSections.includes('turnos') && activeSection === 'turnos' && (
          <Panel title="Turnos" subtitle="Revisa los turnos programados por evento y rol.">
            <GenericTable
              columns={[
                { key: 'id' },
                { key: 'event_id', label: 'Evento' },
                { key: 'role_id', label: 'Rol' },
                { key: 'inicio' },
                { key: 'fin' },
              ]}
              rows={shifts.data}
              loading={shifts.loading}
              emptyMessage={shifts.error ?? 'No hay turnos programados.'}
            />
          </Panel>
        )}

        {allowedSections.includes('asignaciones') && activeSection === 'asignaciones' && (
          <Panel title="Asignaciones" subtitle="Valida quién está asignado a cada turno.">
            <GenericTable
              columns={[
                { key: 'id' },
                { key: 'shift_id', label: 'Turno' },
                { key: 'person_id', label: 'Persona' },
                { key: 'estado', label: 'Estado' },
                { key: 'event_name', label: 'Evento', render: (_v, assignment) => {
                  const shift = shifts.data.find((item) => item.id === assignment.shift_id)
                  const eventName = shift ? eventsById.get(shift.event_id)?.name : undefined
                  return eventName ?? 'Sin evento'
                } },
              ]}
              rows={assignmentRows}
              loading={assignments.loading || shifts.loading || events.loading}
              emptyMessage={assignments.error ?? 'No hay asignaciones registradas.'}
            />
          </Panel>
        )}
      </main>
    </div>
  )
}

export default VolunteersApp
