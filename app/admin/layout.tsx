import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const nav = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/audits', label: 'Audits' },
  { href: '/admin/jobs', label: 'Jobs' },
  { href: '/admin/ai', label: 'AI usage' },
  { href: '/admin/log', label: 'Activity log' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin();
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
        <nav aria-label="Admin" className="flex flex-wrap gap-5 text-sm">
          {nav.map(n => <Link key={n.href} href={n.href} className="hover:text-accent">{n.label}</Link>)}
        </nav>
        <span className="text-sm text-muted">Admin · {s.user.email} · <Link href="/app" className="underline">App</Link></span>
      </div>
      {children}
    </div>
  );
}
