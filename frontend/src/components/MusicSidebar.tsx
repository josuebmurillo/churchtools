import { useState } from 'react'

type MusicSection = 'general' | 'ensayo' | 'setlist' | 'canciones'

type MusicSidebarProps = {
  activeSection: MusicSection
  visibleSections?: MusicSection[]
  setActiveSection: (section: MusicSection) => void
  onLogout: () => void
}

import React from 'react'
const MusicSidebar = React.memo(({ activeSection, visibleSections, setActiveSection, onLogout }: MusicSidebarProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleSectionChange = (section: MusicSection) => {
    setActiveSection(section)
    setIsMenuOpen(false)
  }

  const handleLogout = () => {
    setIsMenuOpen(false)
    onLogout()
  }

  const items = [
    { key: 'general', label: 'General' },
    { key: 'ensayo', label: 'Ensayo' },
    { key: 'setlist', label: 'Setlist' },
    { key: 'canciones', label: 'Canciones' },
  ].filter((item) => !visibleSections || visibleSections.includes(item.key as MusicSection))

  return (
    <aside className={`sidebar ${isMenuOpen ? 'is-open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-badge">MU</div>
          <div>
            <h1>Música</h1>
            <p>Setlist y ensayo</p>
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
          {items.map((item) => (
            <button
              key={item.key}
              className={activeSection === item.key ? 'active' : ''}
              onClick={() => handleSectionChange(item.key as MusicSection)}
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
})

export type { MusicSection }
export default MusicSidebar
