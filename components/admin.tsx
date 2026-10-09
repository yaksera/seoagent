export const usd = (n: number | null | undefined) => (n == null ? '–' : `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`);
export const when = (d: Date | null | undefined) => (d ? d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '–');

export function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-mono text-3xl">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-muted"><tr>{head.map(h => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2">{children}</tbody>
      </table>
      {empty && <p className="px-3 py-6 text-center text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}
