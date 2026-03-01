import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-5xl font-semibold tracking-tight">404</p>
      <p className="text-sm text-slate-600">The page you requested does not exist.</p>
      <Link to="/" className="ui-control inline-flex items-center rounded-xl bg-slate-900 px-4 text-white">
        Return home
      </Link>
    </div>
  );
}
