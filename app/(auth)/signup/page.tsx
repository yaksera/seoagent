import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm, AuthShell } from '@/components/ui';
import { getSession } from '@/lib/auth';
import { TRIAL_DAYS } from '@/lib/plans';
import { signup } from '../actions';

export default async function SignupPage() {
  if (await getSession()) redirect('/app');
  return (
    <AuthShell title="Start your free trial">
      <p className="-mt-3 mb-6 text-sm text-muted">{TRIAL_DAYS} days free, no card needed. Then $49 per website per month.</p>
      <AuthForm
        action={signup}
        submit="Create account"
        pending="Creating account…"
        fields={[
          { name: 'name', label: 'Your name', autoComplete: 'name' },
          { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
          { name: 'password', label: 'Password (10+ characters)', type: 'password', autoComplete: 'new-password' },
        ]}
        footer={<>Already have an account? <Link href="/login" className="underline">Log in</Link>. By signing up you agree to the <Link href="/terms" className="underline">terms</Link>.</>}
      />
    </AuthShell>
  );
}
