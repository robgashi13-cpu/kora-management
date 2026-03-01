import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Settings, FileText } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout() {
  return (
    <div className="app-shell min-h-dvh bg-slate-50 text-slate-900">
      <header className="app-topbar">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <h1 className="text-base font-semibold tracking-tight text-slate-900 md:text-lg">KorAuto Management</h1>
          <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="app-mobile-nav md:hidden" aria-label="Primary mobile">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'mobile-nav-item-active' : ''}`}
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
