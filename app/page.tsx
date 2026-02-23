import Dashboard from '@/components/Dashboard';
import { TextMorph } from 'torph/react';

export default function Home() {
  return (
    <main className="relative h-[100dvh] overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[hsl(var(--background))] via-[hsl(var(--background))/0.92] to-transparent px-4 py-3 text-center">
        <TextMorph className="text-sm font-medium text-[hsl(var(--foreground))/0.85]">
          Hello world
        </TextMorph>
        <p className="mt-1 text-xs text-[hsl(var(--foreground))/0.65]">
          effortlessly and seamlessly transition between text with {'<TextMorph/>'} built on Int
        </p>
      </div>
      <Dashboard />
    </main>
  );
}
