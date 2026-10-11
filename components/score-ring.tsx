const tone = (s: number) => (s >= 80 ? 'var(--color-accent)' : s >= 50 ? 'var(--color-warning)' : 'var(--color-critical)');

export function ScoreRing({ score, label, sub, size = 132 }: { score: number | null; label: string; sub?: string; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  return (
    <figure className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${label}: ${score ?? 'not available'} out of 100`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-line)" strokeWidth="9" />
        {score != null && (
          <circle cx="60" cy="60" r={r} fill="none" stroke={tone(value)} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 60 60)" />
        )}
        <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="font-mono" fontSize="34" fill="currentColor">{score ?? '–'}</text>
      </svg>
      <figcaption>
        <span className="block font-medium">{label}</span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </figcaption>
    </figure>
  );
}
