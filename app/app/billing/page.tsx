import { requireUser } from '@/lib/auth';
import { planLabel } from '@/lib/plans';

export default async function BillingPage() {
  const s = await requireUser();
  return <h1 className="text-2xl font-semibold">Billing · {planLabel(s.account)}</h1>;
}
