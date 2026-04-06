import { useState } from 'react'

type Section =
  | 'resumen'
  | 'usuarios'
  | 'ministerios'
  | 'voluntarios'
  | 'seguimiento'
  | 'consejerias'
  | 'calendario'
  | 'metricas'
  | 'mapa'
  | 'proveedores'

type AdminSidebarProps = {
  activeSection: Section
  setActiveSection: (section: Section) => void
  onLogout: () => void
}

const AdminSidebar = ({ activeSection, setActiveSection, onLogout }: AdminSidebarProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleSectionChange = (section: Section) => {
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
          <div className="brand-badge">IC</div>
          <div>
            <h1>Administración</h1>
            <p>Gestión integral</p>
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
            { key: 'resumen', label: 'Resumen' },
            { key: 'usuarios', label: 'Usuarios' },
            { key: 'ministerios', label: 'Ministerios' },
            { key: 'voluntarios', label: 'Voluntarios' },
            { key: 'seguimiento', label: 'Seguimiento' },
            { key: 'consejerias', label: 'Consejerías' },
            { key: 'calendario', label: 'Calendario' },
            { key: 'metricas', label: 'Métricas' },
            { key: 'mapa', label: 'Mapa' },
            { key: 'proveedores', label: 'Proveedores' },
          ].map((item) => (
            <button
              key={item.key}
              className={activeSection === item.key ? 'active' : ''}
              onClick={() => handleSectionChange(item.key as Section)}
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

export default AdminSidebar
