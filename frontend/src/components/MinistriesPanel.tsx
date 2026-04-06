import type { Ministry, Team, TeamRole } from '../types'
import Panel from './Panel'

type MinistriesPanelProps = {
  ministries: Ministry[]
  ministriesLoading: boolean
  ministriesError?: string | null
  teams: Team[]
  teamsLoading: boolean
  teamsError?: string | null
  teamRoles: TeamRole[]
  ministriesById: Map<number, Ministry>
  editingMinistryId: number | null
  editingMinistryName: string
  editingMinistryParentId: string
  setEditingMinistryName: (value: string) => void
  setEditingMinistryParentId: (value: string) => void
  handleStartEditMinistry: (ministry: Ministry) => void
  handleSaveMinistryName: (ministry: Ministry) => void
  handleCancelEditMinistry: () => void
  handleDeleteMinistry: (ministry: Ministry) => void
  ministryForm: { name: string; description: string; parent_id: string }
  setMinistryForm: (value: { name: string; description: string; parent_id: string }) => void
  teamForm: { name: string; ministry_id: string; description: string }
  setTeamForm: (value: { name: string; ministry_id: string; description: string }) => void
  ministryRoleForm: { name: string; level: string; ministry_id: string }
  setMinistryRoleForm: (value: { name: string; level: string; ministry_id: string }) => void
  ministryRoleFilterId: string
  setMinistryRoleFilterId: (value: string) => void
  teamFilterMinistryId: string
  setTeamFilterMinistryId: (value: string) => void
  handleCreateMinistry: (event: React.FormEvent<HTMLFormElement>) => void
  handleCreateTeam: (event: React.FormEvent<HTMLFormElement>) => void
  handleCreateMinistryRole: (event: React.FormEvent<HTMLFormElement>) => void
}

const MinistriesPanel = ({
  ministries,
  ministriesLoading,
  ministriesError,
  teams,
  teamsLoading,
  teamsError,
  teamRoles,
  ministriesById,
  editingMinistryId,
  editingMinistryName,
  editingMinistryParentId,
  setEditingMinistryName,
  setEditingMinistryParentId,
  handleStartEditMinistry,
  handleSaveMinistryName,
  handleCancelEditMinistry,
  handleDeleteMinistry,
  ministryForm,
  setMinistryForm,
  teamForm,
  setTeamForm,
  ministryRoleForm,
  setMinistryRoleForm,
  ministryRoleFilterId,
  setMinistryRoleFilterId,
  teamFilterMinistryId,
  setTeamFilterMinistryId,
  handleCreateMinistry,
  handleCreateTeam,
  handleCreateMinistryRole,
}: MinistriesPanelProps) => (
  <section className="section-grid">
    <Panel title="Ministerios" subtitle="Consulta y administra las áreas de servicio." className="module-panel--full">
        {ministriesLoading ? (
          <div className="table-row loading">Cargando ministerios...</div>
        ) : ministries.length === 0 ? (
          <div className="table-row loading">{ministriesError ?? 'Aún no hay ministerios registrados.'}</div>
        ) : (
          <div className="ministry-grid">
            {ministries.map((ministry) => (
              <div className="ministry-card" key={ministry.id}>
                <div className="ministry-card__header">
                  {editingMinistryId === ministry.id ? (
                    <input
                      className="input"
                      value={editingMinistryName}
                      onChange={(event) => setEditingMinistryName(event.target.value)}
                    />
                  ) : (
                    <button className="ministry-card__title" type="button">
                      <h4>{ministry.name}</h4>
                      <span className="ministry-card__toggle">Ver detalle</span>
                    </button>
                  )}
                  <span className="ministry-card__badge">
                    {ministry.parent_id
                      ? ministriesById.get(ministry.parent_id)?.name ?? 'Padre'
                      : 'Sin ministerio padre'}
                  </span>
                </div>
                <p className="ministry-card__description">
                  {ministry.description ?? 'Sin descripción registrada'}
                </p>
                <div className="ministry-card__footer">
                  {editingMinistryId === ministry.id ? (
                    <select
                      className="input"
                      value={editingMinistryParentId}
                      onChange={(event) => setEditingMinistryParentId(event.target.value)}
                    >
                      <option value="">Sin padre</option>
                      {ministries
                        .filter((item) => item.id !== ministry.id)
                        .map((item) => (
                          <option key={`parent-edit-${item.id}`} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <span className="ministry-card__meta">
                      Padre:{' '}
                      {ministry.parent_id
                        ? ministriesById.get(ministry.parent_id)?.name ?? '—'
                        : '—'}
                    </span>
                  )}
                  <div className="row-actions">
                    {editingMinistryId === ministry.id ? (
                      <>
                        <button
                          className="action-button"
                          type="button"
                          onClick={() => handleSaveMinistryName(ministry)}
                        >
                          Guardar
                        </button>
                        <button className="action-button ghost" type="button" onClick={handleCancelEditMinistry}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="action-button"
                          type="button"
                          onClick={() => handleStartEditMinistry(ministry)}
                        >
                          Editar
                        </button>
                        <button
                          className="action-button danger"
                          type="button"
                          onClick={() => handleDeleteMinistry(ministry)}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    <Panel title="Nuevo ministerio" subtitle="Crea una nueva área de servicio.">
      <form className="form" onSubmit={handleCreateMinistry}>
        <label className="field">
          Nombre
          <input
            className="input"
            value={ministryForm.name}
            onChange={(event) => setMinistryForm({ ...ministryForm, name: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Descripción
          <input
            className="input"
            value={ministryForm.description}
            onChange={(event) =>
              setMinistryForm({ ...ministryForm, description: event.target.value })
            }
          />
        </label>
        <label className="field">
          Ministerio padre (opcional)
          <select
            className="input"
            value={ministryForm.parent_id}
            onChange={(event) => setMinistryForm({ ...ministryForm, parent_id: event.target.value })}
          >
            <option value="">Sin ministerio padre</option>
            {ministries.map((ministry) => (
              <option key={`parent-${ministry.id}`} value={ministry.id}>
                {ministry.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" type="submit">
          Crear ministerio
        </button>
      </form>
    </Panel>
    <Panel title="Nuevo equipo" subtitle="Crea equipos y asígnalos a un ministerio.">
      <form className="form" onSubmit={handleCreateTeam}>
        <label className="field">
          Nombre del equipo
          <input
            className="input"
            value={teamForm.name}
            onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })}
            required
          />
        </label>
        <label className="field">
          Ministerio
          <select
            className="input"
            value={teamForm.ministry_id}
            onChange={(event) => setTeamForm({ ...teamForm, ministry_id: event.target.value })}
            required
          >
            <option value="">Selecciona un ministerio</option>
            {ministries.map((ministry) => (
              <option key={`team-ministry-${ministry.id}`} value={ministry.id}>
                {ministry.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Descripción
          <input
            className="input"
            value={teamForm.description}
            onChange={(event) => setTeamForm({ ...teamForm, description: event.target.value })}
          />
        </label>
        <button className="primary" type="submit">
          Crear equipo
        </button>
      </form>
    </Panel>
    <Panel title="Nuevo rol por ministerio" subtitle="Define roles operativos por cada ministerio.">
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
              <option key={`role-ministry-${ministry.id}`} value={ministry.id}>
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
          Crear rol
        </button>
      </form>
    </Panel>
    <Panel title="Roles registrados" subtitle="Filtra y revisa roles por ministerio.">
      <label className="field">
        Ver roles de
        <select
          className="input"
          value={ministryRoleFilterId}
          onChange={(event) => setMinistryRoleFilterId(event.target.value)}
        >
          <option value="">Todos</option>
          {ministries.map((ministry) => (
            <option key={`filter-role-${ministry.id}`} value={ministry.id}>
              {ministry.name}
            </option>
          ))}
        </select>
      </label>
      <div className="team-grid">
        {teamRoles
          .filter((role) =>
            ministryRoleFilterId ? String(role.ministry_id ?? '') === ministryRoleFilterId : true
          )
          .map((role) => (
            <div className="team-card" key={`role-${role.id}`}>
              <h4>{role.name}</h4>
              <p className="detail">
                {role.ministry_id
                  ? ministriesById.get(role.ministry_id)?.name ?? 'Ministerio'
                  : 'Sin ministerio asignado'}
              </p>
              <p className="team-card__desc">Nivel: {role.level ?? '—'}</p>
            </div>
          ))}
        {teamRoles.length === 0 && <div className="table-row loading">Aún no hay roles registrados.</div>}
      </div>
    </Panel>
    <Panel title="Equipos" subtitle="Consulta equipos registrados y su ministerio.">
      <label className="field">
        Filtrar por ministerio
        <select
          className="input"
          value={teamFilterMinistryId}
          onChange={(event) => setTeamFilterMinistryId(event.target.value)}
        >
          <option value="">Todos</option>
          {ministries.map((ministry) => (
            <option key={`filter-ministry-${ministry.id}`} value={ministry.id}>
              {ministry.name}
            </option>
          ))}
        </select>
      </label>
      {teamsLoading ? (
        <div className="table-row loading">Cargando equipos...</div>
      ) : teams.length === 0 ? (
        <div className="table-row loading">{teamsError ?? 'Aún no hay equipos registrados.'}</div>
      ) : (
        <div className="team-grid">
          {teams
            .filter((team) =>
              teamFilterMinistryId ? String(team.ministry_id ?? '') === teamFilterMinistryId : true
            )
            .map((team) => (
              <div className="team-card" key={team.id}>
                <h4>{team.name}</h4>
                <p className="detail">
                  {team.ministry_id
                    ? ministriesById.get(team.ministry_id)?.name ?? 'Ministerio'
                    : 'Sin ministerio asignado'}
                </p>
                <p className="team-card__desc">{team.description ?? 'Sin descripción registrada'}</p>
              </div>
            ))}
        </div>
      )}
    </Panel>
  </section>
)

export default MinistriesPanel
