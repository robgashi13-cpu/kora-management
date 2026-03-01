import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Settings, FileText, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="app-shell min-h-dvh bg-slate-50 text-slate-900">
      <aside className={`app-sidebar ${collapsed ? 'w-20' : 'w-64'}`}>
        <button
          className="ui-control mb-6 inline-flex w-full items-center justify-center border border-slate-200 bg-white text-slate-700"
          onClick={() => setCollapsed((v) => !v)}
          aria-label="Toggle sidebar"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <nav className="space-y-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            >
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-topbar">
          <h1 className="text-base font-semibold tracking-tight">KorAuto Management</h1>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
