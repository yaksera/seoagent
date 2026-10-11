'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1 text-xs hover:border-ink"
    >
      {done ? 'Copied' : label}
    </button>
  );
}
