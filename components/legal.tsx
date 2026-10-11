export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="max-w-2xl space-y-4 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm">Last updated {updated}</p>
      <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">Template text. Have a lawyer review it and add your business name, address and governing law before launch.</p>
      {children}
    </article>
  );
}
