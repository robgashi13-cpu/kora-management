import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="h-[var(--app-height,100dvh)] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] overflow-hidden">
      <Dashboard />
    </main>
  );
}
