'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AuditForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
    const json = await res.json().catch(() => ({ error: 'Something went wrong.' }));
    if (!res.ok) { setError(json.error); setBusy(false); return; }
    router.push(`/audit/${json.id}`);
  }

  return (
    <form onSubmit={submit} className="mt-8">
      <label htmlFor="url" className="block text-sm font-medium">Website address</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="url" required value={url} onChange={e => setUrl(e.target.value)} disabled={busy}
          placeholder="example.com" inputMode="url" autoComplete="url"
          className="min-h-12 flex-1 rounded-md border border-line bg-white px-3 text-base disabled:opacity-60"
        />
        <button disabled={busy} className="min-h-12 rounded-md bg-ink px-5 font-medium text-white hover:bg-accent disabled:opacity-60">
          {busy ? 'Checking pages…' : 'Run audit'}
        </button>
      </div>
      <p className="mt-2 text-sm text-muted" aria-live="polite">
        {busy ? 'Reading up to 50 pages. This usually takes under a minute.' : 'Checks up to 50 pages. Nothing on your site is changed.'}
      </p>
      {error && <p role="alert" className="mt-3 rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">{error}</p>}
    </form>
  );
}
