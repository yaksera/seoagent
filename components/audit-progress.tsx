'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Re-renders the server page every 3 seconds until the background audit finishes.
export function AuditProgress({ status, url }: { status: string; url: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <div className="max-w-xl" aria-live="polite">
      <p className="text-sm text-muted">{status === 'queued' ? 'Waiting to start' : 'Checking pages'}</p>
      <h1 className="mt-1 break-all text-2xl font-semibold">{url}</h1>
      <div className="mt-6 h-1.5 overflow-hidden rounded bg-line">
        <div className="h-full w-1/3 animate-[progress_1.4s_ease-in-out_infinite] rounded bg-accent" />
      </div>
      <p className="mt-3 text-sm text-muted">This usually takes under a minute. You can leave this page; the audit keeps running.</p>
      <style>{'@keyframes progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </div>
  );
}
