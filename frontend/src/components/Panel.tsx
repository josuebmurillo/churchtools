import type { ReactNode } from 'react'

/**
 * Panel - Componente genérico para secciones con título, subtítulo y acciones.
 */
type PanelProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

import React from 'react'
const Panel = React.memo(({ title, subtitle, actions, children, className = '' }: PanelProps) => (
  <section className={`module-panel ${className}`}>
    <div className="module-summary">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </div>
    {children}
  </section>
))

export default Panel
