import { Bar } from 'react-chartjs-2'
import { useMemo } from 'react'
import GenericTable from './GenericTable'
import type { ChartData } from 'chart.js'
import type { Ministry, Person, Team, TeamRole } from '../types'

type AssignmentForm = {
  person_id: string
  ministry_id: string
  team_id: string
  role_id: string
}

type MinistryRoleForm = {
  name: string
  level: string
  ministry_id: string
}

type VolunteersPanelProps = {
  teamMembersCount: number
  volunteersByMinistrySize: number
  rolesAverage: number
  volunteersByMinistryChart: ChartData<'bar', number[], unknown>
  assignmentSearch: string
  setAssignmentSearch: (value: string) => void
  assignmentForm: AssignmentForm
  setAssignmentForm: (value: AssignmentForm) => void
  filteredAssignmentPeople: Person[]
  teamsByMinistry: Map<number, Team[]>
  rolesByMinistry: Map<number, TeamRole[]>
  handleAssignMember: (event: React.FormEvent<HTMLFormElement>) => void
  ministries: Ministry[]
  ministryRoleForm: MinistryRoleForm
  setMinistryRoleForm: (value: MinistryRoleForm) => void
  handleCreateMinistryRole: (event: React.FormEvent<HTMLFormElement>) => void
  editingVolunteerRoleId: number | null
  handleStartEditVolunteerRole: (role: TeamRole) => void
  handleCancelEditVolunteerRole: () => void
  handleDeleteVolunteerRole: (roleId: number) => void
  volunteerMinistryRoleFilterId: string
  setVolunteerMinistryRoleFilterId: (value: string) => void
  teamRoles: TeamRole[]
  teamRolesLoading: boolean
  teamRolesError?: string | null
  ministriesById: Map<number, Ministry>
}

const VolunteersPanel = ({
  teamMembersCount,
  volunteersByMinistrySize,
  rolesAverage,
  volunteersByMinistryChart,
  assignmentSearch,
  setAssignmentSearch,
  assignmentForm,
  setAssignmentForm,
  filteredAssignmentPeople,
  teamsByMinistry,
  rolesByMinistry,
  handleAssignMember,
  ministries,
  ministryRoleForm,
  setMinistryRoleForm,
  handleCreateMinistryRole,
  editingVolunteerRoleId,
  handleStartEditVolunteerRole,
  handleCancelEditVolunteerRole,
  handleDeleteVolunteerRole,
  volunteerMinistryRoleFilterId,
  setVolunteerMinistryRoleFilterId,
  teamRoles,
  teamRolesLoading,
  teamRolesError,
  ministriesById,
}: VolunteersPanelProps) => {
  const volunteerRoleRows = useMemo(
    () =>
      teamRoles
        .filter((role) =>
          volunteerMinistryRoleFilterId
            ? String(role.ministry_id ?? '') === volunteerMinistryRoleFilterId
            : true
        )
        .map((role) => ({
          id: role.id,
          name: role.name,
          ministry: role.ministry_id
            ? ministriesById.get(role.ministry_id)?.name ?? 'Ministerio'
            : 'Sin ministerio asignado',
          level: role.level ?? '—',
          actions: '',
        })),
    [teamRoles, volunteerMinistryRoleFilterId, ministriesById]
  )

  return (
  <section className="section-grid">
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

    <div className="module-panel">
      <div className="module-summary">
        <div>
          <h3>Asignar persona a un equipo</h3>
          <p>Vincula personas a equipos y define su rol operativo.</p>
        </div>
      </div>
      <form className="form" onSubmit={handleAssignMember}>
        <label className="field">
          Buscar persona
          <input
            className="input"
            value={assignmentSearch}
            onChange={(event) => setAssignmentSearch(event.target.value)}
            placeholder="Escribe el nombre de la persona"
          />
        </label>
        <label className="field">
          Persona
          <select
            className="input"
            value={assignmentForm.person_id}
            onChange={(event) =>
              setAssignmentForm({ ...assignmentForm, person_id: event.target.value })
            }
            required
          >
            <option value="">Selecciona una persona</option>
            {filteredAssignmentPeople.map((person) => (
              <option key={`assign-person-${person.id}`} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Ministerio
          <select
            className="input"
            value={assignmentForm.ministry_id}
            onChange={(event) =>
              setAssignmentForm({
                ...assignmentForm,
                ministry_id: event.target.value,
                team_id: '',
                role_id: '',
              })
            }
            required
          >
            <option value="">Selecciona un ministerio</option>
            {ministries.map((ministry) => (
              <option key={`assign-ministry-${ministry.id}`} value={ministry.id}>
                {ministry.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Equipo
          <select
            className="input"
            value={assignmentForm.team_id}
            onChange={(event) => setAssignmentForm({ ...assignmentForm, team_id: event.target.value })}
            required
            disabled={!assignmentForm.ministry_id}
          >
            <option value="">Selecciona un equipo</option>
            {(assignmentForm.ministry_id
              ? teamsByMinistry.get(Number(assignmentForm.ministry_id)) ?? []
              : []
            ).map((team) => (
              <option key={`assign-team-${team.id}`} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Rol del equipo (opcional)
          <select
            className="input"
            value={assignmentForm.role_id}
            onChange={(event) => setAssignmentForm({ ...assignmentForm, role_id: event.target.value })}
            disabled={!assignmentForm.ministry_id}
          >
            <option value="">Selecciona un rol</option>
            {(assignmentForm.ministry_id
              ? rolesByMinistry.get(Number(assignmentForm.ministry_id)) ?? []
              : []
            ).map((role) => (
              <option key={`assign-role-${role.id}`} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          type="submit"
          disabled={!assignmentForm.person_id || !assignmentForm.team_id}
        >
          Guardar asignación
        </button>
      </form>
      {filteredAssignmentPeople.length === 0 && (
        <div className="table-row loading">No se encontraron personas con ese criterio.</div>
      )}
    </div>

    <div className="module-panel">
      <div className="module-summary">
        <div>
          <h3>Crear rol por ministerio</h3>
          <p>Registra roles reutilizables para asignaciones del equipo.</p>
        </div>
      </div>
      <form className="form" onSubmit={handleCreateMinistryRole}>
        <label className="field">
          Ministerio
          <select
            className="input"
            value={ministryRoleForm.ministry_id}
            onChange={(event) =>
              setMinistryRoleForm({ ...ministryRoleForm, ministry_id: event.target.value })
            }
            required
          >
            <option value="">Selecciona un ministerio</option>
            {ministries.map((ministry) => (
              <option key={`vol-role-ministry-${ministry.id}`} value={ministry.id}>
                {ministry.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Rol
          <input
            className="input"
            value={ministryRoleForm.name}
            onChange={(event) => setMinistryRoleForm({ ...ministryRoleForm, name: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Nivel (opcional)
          <input
            className="input"
            value={ministryRoleForm.level}
            onChange={(event) => setMinistryRoleForm({ ...ministryRoleForm, level: event.target.value })}
          />
        </label>
        <button className="primary" type="submit">
          {editingVolunteerRoleId ? 'Actualizar rol' : 'Guardar rol'}
        </button>
        {editingVolunteerRoleId && (
          <button className="action-button ghost" type="button" onClick={handleCancelEditVolunteerRole}>
            Cancelar edición
          </button>
        )}
      </form>
    </div>

    <div className="module-panel">
      <div className="module-summary">
        <div>
          <h3>Roles por ministerio</h3>
          <p>Filtra y administra roles según el ministerio.</p>
        </div>
      </div>
      <label className="field">
        Ver roles de
        <select
          className="input"
          value={volunteerMinistryRoleFilterId}
          onChange={(event) => setVolunteerMinistryRoleFilterId(event.target.value)}
        >
          <option value="">Todos</option>
          {ministries.map((ministry) => (
            <option key={`vol-role-filter-${ministry.id}`} value={ministry.id}>
              {ministry.name}
            </option>
          ))}
        </select>
      </label>
      <GenericTable
        className="volunteer-roles-table"
        columns={[
          { key: 'name', label: 'Rol' },
          { key: 'ministry', label: 'Ministerio' },
          { key: 'level', label: 'Nivel' },
          {
            key: 'actions',
            label: 'Acciones',
            render: (_, row) => {
              const role = teamRoles.find((item) => item.id === Number(row.id))
              return (
                <div className="row-actions">
                  <button
                    className="action-button ghost"
                    type="button"
                    onClick={() => role && handleStartEditVolunteerRole(role)}
                  >
                    Editar
                  </button>
                  <button
                    className="action-button danger"
                    type="button"
                    onClick={() => handleDeleteVolunteerRole(Number(row.id))}
                  >
                    Eliminar
                  </button>
                </div>
              )
            },
          },
        ]}
        rows={volunteerRoleRows}
        loading={teamRolesLoading}
        emptyMessage={teamRolesError ?? 'Aún no hay roles registrados.'}
      />
    </div>
  </section>
  )
}

export default VolunteersPanel
