'use client';

import { useActionState } from 'react';
import { Notice, Submit, btnCls } from './ui';

type State = { error?: string; ok?: string } | undefined;

// A single-button form for a server action that may return an error message.
export function ActionButton({ action, label, pending, className = btnCls, confirm }: { action: (s: State, f: FormData) => Promise<State>; label: string; pending?: string; className?: string; confirm?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} onSubmit={e => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className="space-y-2">
      <Submit pending={pending} className={className}>{label}</Submit>
      <Notice state={state} />
    </form>
  );
}
