import Dashboard from '@/components/Dashboard';
import ErrorBoundary from '@/src/ErrorBoundary';

export default function Home() {
  return (
    <main className="relative h-[100dvh] overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <ErrorBoundary>
        <Dashboard />
      </ErrorBoundary>
    </main>
  );
}
