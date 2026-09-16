import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { type ReactNode } from 'react'
import { Icon } from './Icon'

const NAV = [
  { to: '/applications', icon: 'dashboard', label: 'Applications' },
  { to: '/resumes', icon: 'description', label: 'Resume Workspace' },
  { to: '/analytics', icon: 'monitoring', label: 'Analytics' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
]

interface ShellProps {
  children: ReactNode
  /** Global search box value; the Applications page owns the query. */
  search: string
  onSearch: (value: string) => void
  onNewApplication: () => void
}

export function Shell({ children, search, onSearch, onNewApplication }: ShellProps) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-outline-variant bg-surface">
        <div className="flex items-center gap-sm px-md pb-md pt-lg">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-on-primary">
            <Icon name="conversion_path" size={20} />
          </span>
          <span className="text-headline-sm tracking-tight text-on-surface">DevTrack</span>
        </div>

        <div className="px-md pb-md">
          <button className="btn-primary w-full" onClick={onNewApplication}>
            <Icon name="add" size={18} />
            New Application
          </button>
        </div>

        <nav className="flex-1 space-y-[2px] px-sm">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex items-center gap-sm rounded-md px-sm py-[7px] text-body-md transition-colors ${
                  isActive
                    ? 'bg-primary-container font-semibold text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute -left-sm top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
                  )}
                  <Icon name={item.icon} size={18} fill={isActive} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-outline-variant px-md py-sm text-body-sm text-on-surface-variant">
          Local data · <span className="font-mono">server/data/db.json</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-md border-b border-outline-variant bg-surface px-md">
          <div className="relative max-w-xl flex-1">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              className="field pl-[34px]"
              placeholder="Search applications, companies, or notes…"
              value={search}
              onChange={(event) => {
                onSearch(event.target.value)
                if (location.pathname !== '/applications') navigate('/applications')
              }}
            />
          </div>

          <a
            className="btn-default"
            href="/api/export/applications.csv"
            title="Download every application as CSV"
          >
            <Icon name="download" size={18} />
            Export CSV
          </a>

          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-primary-container text-primary">
            <Icon name="person" size={18} />
          </span>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
