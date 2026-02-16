import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="h-[100dvh] overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Dashboard />
    </main>
  );
}
