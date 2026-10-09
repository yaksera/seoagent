import { AuthForm } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { changePassword, deleteAccount } from '../actions';

export default async function SettingsPage() {
  const s = await requireUser();
  return (
    <div className="grid max-w-3xl gap-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Name</dt><dd>{s.user.name}</dd>
          <dt className="text-muted">Email</dt><dd>{s.user.email} {s.user.emailVerifiedAt ? <span className="text-accent">(confirmed)</span> : <span className="text-warning">(not confirmed)</span>}</dd>
          <dt className="text-muted">Member since</dt><dd>{s.user.createdAt.toLocaleDateString('en-GB')}</dd>
        </dl>
      </section>
      <section className="max-w-sm">
        <h2 className="font-semibold">Change password</h2>
        <div className="mt-3">
          <AuthForm action={changePassword} submit="Change password" pending="Saving…" fields={[
            { name: 'current', label: 'Current password', type: 'password', autoComplete: 'current-password' },
            { name: 'next', label: 'New password (10+ characters)', type: 'password', autoComplete: 'new-password' },
          ]} />
        </div>
      </section>
      <section className="max-w-sm rounded-md border border-critical/30 p-4">
        <h2 className="font-semibold text-critical">Delete account</h2>
        <p className="mb-3 mt-1 text-sm text-muted">Cancels your subscription and permanently deletes your data after 30 days. Changes already published to your sites stay.</p>
        <AuthForm action={deleteAccount} submit="Delete my account" pending="Deleting…" fields={[{ name: 'confirm', label: `Type ${s.user.email} to confirm` }]} />
      </section>
    </div>
  );
}
