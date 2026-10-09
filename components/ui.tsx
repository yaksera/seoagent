'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

export const inputCls = 'mt-1 block min-h-11 w-full rounded-md border border-line bg-white px-3 text-base disabled:opacity-60';
export const btnCls = 'inline-flex min-h-11 items-center justify-center rounded-md bg-ink px-4 font-medium text-white hover:bg-accent disabled:opacity-60';
export const btnSecondaryCls = 'inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-white px-3 text-sm hover:border-ink disabled:opacity-60';

export function Submit({ children, pending, className = btnCls }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return <button disabled={busy} className={className}>{busy ? pending ?? 'Working…' : children}</button>;
}

export function Notice({ state }: { state?: { error?: string; ok?: string } }) {
  if (state?.error) return <p role="alert" className="rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">{state.error}</p>;
  if (state?.ok) return <p role="status" className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">{state.ok}</p>;
  return null;
}

type Action = (state: { error?: string; ok?: string } | undefined, form: FormData) => Promise<{ error?: string; ok?: string } | undefined>;
type Field = { name: string; label: string; type?: string; autoComplete?: string; defaultValue?: string; hidden?: boolean };

export function AuthForm({ action, fields, submit, pending, footer }: { action: Action; fields: Field[]; submit: string; pending: string; footer?: React.ReactNode }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {fields.map(f => f.hidden
        ? <input key={f.name} type="hidden" name={f.name} value={f.defaultValue} />
        : (
          <label key={f.name} className="block text-sm font-medium">
            {f.label}
            <input name={f.name} type={f.type ?? 'text'} autoComplete={f.autoComplete} defaultValue={f.defaultValue} required className={inputCls} />
          </label>
        ))}
      <Notice state={state} />
      <Submit pending={pending}>{submit}</Submit>
      {footer && <div className="text-sm text-muted">{footer}</div>}
    </form>
  );
}

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export { Link };
