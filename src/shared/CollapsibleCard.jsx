import React, { useState } from 'react'

export default function CollapsibleCard({
  id,
  title,
  children,
  className = '',
  badge = null,
  actions = null,
  defaultCollapsed = false
}) {
  const storageKey =
    `mister-screenscraper-card-${id}`

  const [collapsed, setCollapsed] =
    useState(() => {
      const saved =
        localStorage.getItem(storageKey)

      return saved === null
        ? defaultCollapsed
        : saved === 'true'
    })

  function toggleCollapsed() {
    setCollapsed(current => {
      const next = !current
      localStorage.setItem(
        storageKey,
        String(next)
      )
      return next
    })
  }

  return (
    <section
      className={`card collapsible-card ${
        collapsed ? 'card-collapsed' : ''
      } ${className}`.trim()}
    >
      <div className="card-header">
        <div className="card-title-area">
          <h2>{title}</h2>

          {badge !== null && (
            <span className="card-badge">
              {badge}
            </span>
          )}
        </div>

        <div className="card-header-actions">
          {actions}

          <button
            type="button"
            className="collapse-button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls={`card-content-${id}`}
          >
            <span aria-hidden="true">
              {collapsed ? '＋' : '－'}
            </span>

            <span className="collapse-label">
              {collapsed
                ? 'Expandir'
                : 'Minimizar'}
            </span>
          </button>
        </div>
      </div>

      <div
        id={`card-content-${id}`}
        className="card-content"
        hidden={collapsed}
      >
        {children}
      </div>
    </section>
  )
}
