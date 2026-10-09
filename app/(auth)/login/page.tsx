import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm, AuthShell } from '@/components/ui';
import { getSession } from '@/lib/auth';
import { login } from '../actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ disabled?: string }> }) {
  if (await getSession()) redirect('/app');
  const { disabled } = await searchParams;
  return (
    <AuthShell title="Log in">
      {disabled && <p className="mb-4 rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">This account is disabled. Contact support.</p>}
      <AuthForm
        action={login}
        submit="Log in"
        pending="Logging in…"
        fields={[
          { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
          { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
        ]}
        footer={<><Link href="/forgot" className="underline">Forgot password?</Link> · No account? <Link href="/signup" className="underline">Start a free trial</Link></>}
      />
    </AuthShell>
  );
}
