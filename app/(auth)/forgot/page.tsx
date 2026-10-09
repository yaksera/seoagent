import Link from 'next/link';
import { AuthForm, AuthShell } from '@/components/ui';
import { forgotPassword } from '../actions';

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password">
      <AuthForm
        action={forgotPassword}
        submit="Send reset link"
        pending="Sending…"
        fields={[{ name: 'email', label: 'Email', type: 'email', autoComplete: 'email' }]}
        footer={<Link href="/login" className="underline">Back to log in</Link>}
      />
    </AuthShell>
  );
}
