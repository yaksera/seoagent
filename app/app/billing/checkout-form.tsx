'use client';

import { useActionState, useState } from 'react';
import { Notice, Submit, inputCls } from '@/components/ui';

type State = { error?: string; ok?: string } | undefined;

export function CheckoutForm({ action, defaultSites }: { action: (s: State, f: FormData) => Promise<State>; defaultSites: number }) {
  const [state, formAction] = useActionState(action, undefined);
  const [sites, setSites] = useState(defaultSites);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const total = interval === 'month' ? sites * 49 : sites * 490;
  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="block text-sm font-medium">Websites
          <input name="sites" type="number" min={1} max={100} value={sites} onChange={e => setSites(Math.max(1, Number(e.target.value) || 1))} className={`${inputCls} w-28`} />
        </label>
        <fieldset className="text-sm">
          <legend className="font-medium">Billing</legend>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2"><input type="radio" name="interval" value="month" checked={interval === 'month'} onChange={() => setInterval('month')} /> Monthly</label>
            <label className="flex items-center gap-2"><input type="radio" name="interval" value="year" checked={interval === 'year'} onChange={() => setInterval('year')} /> Yearly</label>
          </div>
        </fieldset>
      </div>
      <p className="text-sm">Total: <b className="font-mono">${total}</b> per {interval} plus any tax.</p>
      <Notice state={state} />
      <Submit pending="Opening checkout…">Continue to payment</Submit>
    </form>
  );
}
