import { Outlet } from 'react-router-dom';

export default function AppLayout() {
  return (
    <div className="app-shell min-h-dvh bg-slate-50 text-slate-900" data-mobile-shell="true">
      <main className="app-content" role="main">
        <Outlet />
      </main>
    </div>
  );
}
