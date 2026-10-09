import { AuthForm, AuthShell } from '@/components/ui';
import { resetPassword } from '../actions';

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      <AuthForm
        action={resetPassword}
        submit="Save password"
        pending="Saving…"
        fields={[
          { name: 'token', label: '', hidden: true, defaultValue: token },
          { name: 'password', label: 'New password (10+ characters)', type: 'password', autoComplete: 'new-password' },
        ]}
      />
    </AuthShell>
  );
}
