import { useState } from 'react'

type VolunteersSection = 'eventos' | 'turnos' | 'asignaciones'

type VolunteersSidebarProps = {
  activeSection: VolunteersSection
  setActiveSection: (section: VolunteersSection) => void
  onLogout: () => void
}

const VolunteersSidebar = ({ activeSection, setActiveSection, onLogout }: VolunteersSidebarProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleSectionChange = (section: VolunteersSection) => {
    setActiveSection(section)
    setIsMenuOpen(false)
  }

  const handleLogout = () => {
    setIsMenuOpen(false)
    onLogout()
  }

  return (
    <aside className={`sidebar ${isMenuOpen ? 'is-open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-badge">VO</div>
          <div>
            <h1>Voluntarios</h1>
            <p>Turnos y cobertura</p>
          </div>
        </div>
        <button
          type="button"
          className={`sidebar-toggle ${isMenuOpen ? 'is-open' : ''}`}
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-expanded={isMenuOpen}
          aria-label="Abrir menú"
        >
          ☰
        </button>
      </div>

      <div className="sidebar-collapsible">
        <nav className="section-tabs">
          {[
            { key: 'eventos', label: 'Eventos' },
            { key: 'turnos', label: 'Turnos' },
            { key: 'asignaciones', label: 'Asignaciones' },
          ].map((item) => (
            <button
              key={item.key}
              className={activeSection === item.key ? 'active' : ''}
              onClick={() => handleSectionChange(item.key as VolunteersSection)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button className="action-button danger sidebar-logout" onClick={handleLogout} type="button">
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

export type { VolunteersSection }
export default VolunteersSidebar
