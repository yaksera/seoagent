import Link from 'next/link';
import { logout } from '@/app/(auth)/actions';
import { requireUser } from '@/lib/auth';
import { isActive, planLabel } from '@/lib/plans';
import { stopImpersonating } from '../admin/actions';

export const dynamic = 'force-dynamic';

const nav = [
  { href: '/app', label: 'Sites' },
  { href: '/app/billing', label: 'Billing' },
  { href: '/app/settings', label: 'Settings' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  return (
    <div className="space-y-8">
      {s.impersonating && (
        <form action={stopImpersonating} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning px-3 py-2 text-sm text-white">
          <span>You are viewing as {s.user.email} (admin support session).</span>
          <button className="underline">Return to admin</button>
        </form>
      )}
      {!isActive(s.account) && (
        <p className="rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">
          {s.account.plan === 'past_due' ? 'Your last payment failed. Update your card to keep audits running.' : 'Your trial has ended.'}{' '}
          <Link href="/app/billing" className="font-medium underline">Go to billing</Link>
        </p>
      )}
      {!s.user.emailVerifiedAt && (
        <p className="rounded-md border border-line bg-white px-3 py-2 text-sm text-muted">Please confirm your email address. We sent a link to {s.user.email}.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
        <nav aria-label="App" className="flex gap-5 text-sm">
          {nav.map(n => <Link key={n.href} href={n.href} className="hover:text-accent">{n.label}</Link>)}
          {s.isAdmin && <Link href="/admin" className="text-accent hover:underline">Admin</Link>}
        </nav>
        <div className="flex items-center gap-4 text-sm text-muted">
          <span>{planLabel(s.account)}</span>
          <form action={logout}><button className="hover:text-ink">Log out</button></form>
        </div>
      </div>
      {children}
    </div>
  );
}
