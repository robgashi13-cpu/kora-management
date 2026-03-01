export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="premium-card bg-white p-8">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">This section is ready for production feature implementation.</p>
    </section>
  );
}
