'use client';

import { useState } from 'react';
import type { PageFix } from '@/lib/fixes';

type Field = { label: string; current: string; key: 'title' | 'meta_description' | 'h1' };

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="shrink-0 rounded border border-line px-2 py-1 text-xs hover:border-ink"
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

type FixState = PageFix & { fixId?: string; status?: string };

export function FixPanel({ auditId, url, current, initial, applyAvailable }: { auditId: string; url: string; current: { title: string; meta: string; h1: string }; initial?: FixState; applyAvailable?: boolean }) {
  const [fix, setFix] = useState<FixState | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/fix', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auditId, url }) });
    const json = await res.json().catch(() => ({ error: 'Something went wrong.' }));
    if (res.ok) setFix(json); else setError(json.error);
    setBusy(false);
  }

  if (!fix) {
    return (
      <div>
        <button type="button" onClick={load} disabled={busy} className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-accent disabled:opacity-60">
          {busy ? 'Writing suggestions…' : 'Suggest fixes'}
        </button>
        {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
      </div>
    );
  }

  const fields: Field[] = [
    { label: 'Title', current: current.title, key: 'title' },
    { label: 'Meta description', current: current.meta, key: 'meta_description' },
    { label: 'H1', current: current.h1, key: 'h1' },
  ];

  return (
    <div className="space-y-4">
      {fix.warnings.length > 0 && (
        <ul className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          {fix.warnings.map(w => <li key={w}>{w}</li>)}
        </ul>
      )}
      {fields.map(f => {
        const s = fix[f.key];
        return (
          <div key={f.key} className="rounded-md border border-line bg-white p-3">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-medium">{f.label}</h4>
              {s.keep && <span className="text-xs text-accent">Already good</span>}
            </div>
            <p className={`mt-1 text-sm text-muted ${s.keep ? '' : 'line-through decoration-line'}`}>{f.current || '(missing)'}</p>
            {!s.keep && (
              <>
                <div className="mt-2 flex items-start gap-2">
                  <p className="flex-1 text-sm">{s.recommended} <span className="font-mono text-xs text-muted">({s.recommended.length})</span></p>
                  <Copy text={s.recommended} />
                </div>
                <div className="mt-2 flex items-start gap-2 border-t border-line pt-2">
                  <p className="flex-1 text-sm text-muted">Alternative: {s.alternative}</p>
                  <Copy text={s.alternative} />
                </div>
              </>
            )}
            <p className="mt-2 text-xs text-muted">{s.reason}</p>
          </div>
        );
      })}
    </div>
  );
}
