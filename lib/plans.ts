import type { schema } from './db';

type Account = typeof schema.accounts.$inferSelect;

export const PRICE_PER_SITE_USD = 49;
export const TRIAL_DAYS = 7;

export const LIMITS = {
  freeAuditPages: 20, // anonymous audit on the home page
  trialPages: 100,
  paidPages: 500,
  manualAuditsPerSitePerDay: 3,
  llmBudgetPerSiteUsd: Number(process.env.LLM_BUDGET_PER_SITE_USD) || 5,
};

export function isActive(a: Account) {
  if (a.disabledAt || a.deletedAt) return false;
  if (a.plan === 'active') return true;
  if (a.plan === 'trial') return !a.trialEndsAt || a.trialEndsAt > new Date();
  return false;
}

export const siteLimit = (a: Account) => (a.plan === 'active' ? a.siteQuantity : 1);
export const pageLimit = (a: Account) => (a.plan === 'active' ? LIMITS.paidPages : LIMITS.trialPages);

export function planLabel(a: Account) {
  if (a.plan === 'trial') {
    const days = a.trialEndsAt ? Math.ceil((a.trialEndsAt.getTime() - Date.now()) / 86_400_000) : 0;
    return days > 0 ? `Trial · ${days} day${days === 1 ? '' : 's'} left` : 'Trial ended';
  }
  return { active: 'Active', past_due: 'Payment failed', canceled: 'Canceled' }[a.plan];
}
