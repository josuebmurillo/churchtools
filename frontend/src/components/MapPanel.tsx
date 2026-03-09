import { useRef, useState, type MouseEvent } from 'react'
import type { Ministry, Person, Team, TeamMember, TeamRole } from '../types'

type MapPanelProps = {
  ministries: Ministry[]
  ministriesByParent: Map<number | null, Ministry[]>
  teams: Team[]
  membersByTeam: Map<number, TeamMember[]>
  rolesById: Map<number, TeamRole>
  peopleById: Map<number, Person>
  activeMapMinistryId: number | null
  setActiveMapMinistryId: (value: number | null) => void
}

const MapPanel = ({
  ministries,
  ministriesByParent,
  teams,
  membersByTeam,
  rolesById,
  peopleById,
  activeMapMinistryId,
  setActiveMapMinistryId,
}: MapPanelProps) => {
  const panelRef = useRef<HTMLElement | null>(null)
  const [floatingPosition, setFloatingPosition] = useState<{
    top: number
    left: number
    maxHeight: number
  } | null>(null)

  const activeMinistry = activeMapMinistryId
    ? ministries.find((ministry) => ministry.id === activeMapMinistryId)
    : null
  const activeTeams = activeMapMinistryId
    ? teams.filter((team) => team.ministry_id === activeMapMinistryId)
    : []

  const closeFloatingCard = () => {
    setActiveMapMinistryId(null)
    setFloatingPosition(null)
  }

  const handleMinistryClick = (ministryId: number, event: MouseEvent<HTMLButtonElement>) => {
    const panelRect = panelRef.current?.getBoundingClientRect()
    const nodeRect = event.currentTarget.getBoundingClientRect()

    if (!panelRect) {
      setActiveMapMinistryId(ministryId)
      return
    }

    const horizontalPadding = 12
    const estimatedCardWidth = 460
    const estimatedCardHeight = 420
    const preferredTop = nodeRect.top - panelRect.top - 10
    const minTop = 72
    const maxTop = Math.max(minTop, panelRect.height - estimatedCardHeight - horizontalPadding)
    const top = Math.min(Math.max(minTop, preferredTop), maxTop)
    const spaceToRight = panelRect.right - nodeRect.right
    const spaceToLeft = nodeRect.left - panelRect.left
    const canOpenRight = spaceToRight >= estimatedCardWidth + horizontalPadding
    const canOpenLeft = spaceToLeft >= estimatedCardWidth + horizontalPadding

    let preferredLeft = nodeRect.right - panelRect.left + 12
    if (!canOpenRight && (canOpenLeft || nodeRect.left > panelRect.left + panelRect.width / 2)) {
      preferredLeft = nodeRect.left - panelRect.left - estimatedCardWidth - 12
    }

    const maxLeft = Math.max(
      horizontalPadding,
      panelRect.width - estimatedCardWidth - horizontalPadding,
    )
    const left = Math.min(Math.max(horizontalPadding, preferredLeft), maxLeft)
    const maxHeight = Math.max(240, panelRect.height - top - horizontalPadding)

    setFloatingPosition({ top, left, maxHeight })
    setActiveMapMinistryId(ministryId)
  }

  const renderMinistryTree = (parentId: number | null) => {
    const children = ministriesByParent.get(parentId) ?? []
    if (children.length === 0) return null
    return (
      <ul>
        {children.map((ministry) => (
          <li key={`org-ministry-${ministry.id}`} className="org-node">
            <button
              className="org-card"
              type="button"
              onClick={(event) => handleMinistryClick(ministry.id, event)}
            >
              {ministry.name}
            </button>
            {renderMinistryTree(ministry.id)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section
      className={`module-panel module-panel--map ${activeMapMinistryId ? 'module-panel--map-has-drawer' : ''}`}
      ref={panelRef}
    >
      <div className="module-summary">
        <div>
          <h3>Mapa de Iglesia</h3>
          <p>Estructura jerárquica por ministerios, equipos y roles.</p>
        </div>
      </div>
      {ministries.length === 0 ? (
        <div className="table-row loading">No hay ministerios disponibles.</div>
      ) : (
        <div className="org-chart">
          <ul className="org-root">
            <li className="org-node">
              <div className="org-card org-card--root">Iglesia</div>
              {renderMinistryTree(null)}
            </li>
          </ul>
        </div>
      )}
      {activeMapMinistryId && (
        <aside
          className="map-floating-card"
          style={
            floatingPosition
              ? {
                  top: `${floatingPosition.top}px`,
                  left: `${floatingPosition.left}px`,
                  maxHeight: `${floatingPosition.maxHeight}px`,
                }
              : undefined
          }
        >
          <div className="map-floating-card__header">
            <h3>{activeMinistry?.name ?? 'Ministerio'}</h3>
            <button
              className="action-button ghost"
              type="button"
              onClick={closeFloatingCard}
            >
              Cerrar
            </button>
          </div>
          {activeTeams.length ? (
            <div className="map-floating-card__content">
              {activeTeams.map((team) => (
                <div className="card" key={`map-team-${team.id}`}>
                  <div className="card-header">
                    <h3>{team.name}</h3>
                  </div>
                  <div className="module-table">
                    <div className="table-header">
                      <span>Miembro</span>
                      <span>Rol</span>
                    </div>
                    {(membersByTeam.get(team.id) ?? []).length ? (
                      membersByTeam.get(team.id)?.map((member) => {
                        const role = member.role_id ? rolesById.get(member.role_id)?.name : '—'
                        const personName = peopleById.get(member.person_id)?.name
                        return (
                          <div className="table-row" key={`map-member-${member.id}`}>
                            <span>{personName ?? 'Sin nombre registrado'}</span>
                            <span>{role ?? '—'}</span>
                          </div>
                        )
                      })
                    ) : (
                      <div className="table-row loading">No hay miembros registrados.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-row loading">Este ministerio no tiene equipos registrados.</div>
          )}
        </aside>
      )}
    </section>
  )
}

export default MapPanel
