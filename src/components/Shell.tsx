import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { Menu, MenuItem } from './Menu'
import { usePersistentState } from '../hooks/usePersistentState'
import type { User } from '../types'

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
  user: User
  onSignOut: () => void
}

export function Shell({
  children,
  search,
  onSearch,
  onNewApplication,
  user,
  onSignOut,
}: ShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = usePersistentState('devtrack.sidebarCollapsed', false)

  return (
    <div className="flex h-full">
      <aside
        className={`flex shrink-0 flex-col border-r border-outline-variant bg-surface transition-[width] duration-150 ${
          collapsed ? 'w-14' : 'w-64'
        }`}
      >
        <div className={`flex items-center gap-sm pb-md pt-lg ${collapsed ? 'justify-center' : 'px-md'}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary">
            <Icon name="conversion_path" size={20} />
          </span>
          {!collapsed && (
            <span className="text-headline-sm tracking-tight text-on-surface">DevTrack</span>
          )}
        </div>

        <div className={`pb-md ${collapsed ? 'flex justify-center' : 'px-md'}`}>
          <button
            className={collapsed ? 'btn-primary h-9 w-9 px-0' : 'btn-primary w-full'}
            onClick={onNewApplication}
            title={collapsed ? 'New Application' : undefined}
            aria-label="New Application"
          >
            <Icon name="add" size={18} />
            {!collapsed && 'New Application'}
          </button>
        </div>

        <nav className={`flex-1 space-y-[2px] ${collapsed ? 'px-[10px]' : 'px-sm'}`}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              className={({ isActive }) =>
                `relative flex items-center gap-sm rounded-md py-[7px] text-body-md transition-colors ${
                  collapsed ? 'justify-center px-0' : 'px-sm'
                } ${
                  isActive
                    ? 'bg-primary-container font-semibold text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className={`absolute top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-primary ${
                        collapsed ? '-left-[10px]' : '-left-sm'
                      }`}
                    />
                  )}
                  <Icon name={item.icon} size={18} fill={isActive} />
                  {!collapsed && item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div
          className={`flex items-center border-t border-outline-variant py-sm text-body-sm text-on-surface-variant ${
            collapsed ? 'justify-center' : 'gap-sm pl-md pr-sm'
          }`}
        >
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate">
              Signed in as <span className="font-medium text-on-surface">{user.name}</span>
            </span>
          )}
          <button
            className="btn-ghost btn-sm"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <Icon name={collapsed ? 'left_panel_open' : 'left_panel_close'} size={18} />
          </button>
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

          <div className="ml-auto flex shrink-0 items-center gap-sm">
            <a
              className="btn-default"
              href="/api/export/applications.csv"
              title="Download every application as CSV"
            >
              <Icon name="download" size={18} />
              Export CSV
            </a>

            <ProfileMenu user={user} onSignOut={onSignOut} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

function Avatar({ user, size }: { user: User; size: number }) {
  const [broken, setBroken] = useState(false)
  if (user.avatarUrl && !broken) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="rounded-full"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-primary-container font-semibold text-primary"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function ProfileMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <Menu
      label={user.name}
      className="w-60"
      triggerClassName="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-outline-variant hover:ring-2 hover:ring-primary/20"
      trigger={<Avatar user={user} size={30} />}
    >
      {(close) => (
        <>
          <div className="mb-xs flex items-center gap-sm border-b border-outline-variant px-md pb-sm pt-xs">
            <Avatar user={user} size={32} />
            <div className="min-w-0">
              <div className="truncate text-body-md font-semibold text-on-surface">{user.name}</div>
              <div className="truncate text-body-sm text-on-surface-variant">
                {user.provider === 'google' ? (user.email ?? 'Google account') : `@${user.username}`}
              </div>
            </div>
          </div>
          <MenuItem
            icon="logout"
            onSelect={() => {
              close()
              onSignOut()
            }}
          >
            Sign out
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
