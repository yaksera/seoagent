'use client';

import { useActionState } from 'react';
import { Notice, Submit, inputCls } from '@/components/ui';
import { type Brand, SCHEMA_TYPES } from '@/lib/brand';

type State = { error?: string; ok?: string } | undefined;

const TYPE_LABELS: Record<string, string> = {
  LocalBusiness: 'Local business (general)', Organization: 'Company / organisation (no storefront)', ProfessionalService: 'Professional service (agency, consultant)',
  Store: 'Shop / store', Restaurant: 'Restaurant / café', HomeAndConstructionBusiness: 'Home services (plumber, electrician, builder)', MedicalBusiness: 'Medical / clinic',
  Dentist: 'Dentist', LegalService: 'Legal services', AutomotiveBusiness: 'Automotive', LodgingBusiness: 'Hotel / lodging', TravelAgency: 'Travel / tours',
  EducationalOrganization: 'School / training', FinancialService: 'Finance / accounting', BeautySalon: 'Beauty / salon',
};

function Field({ label, name, defaultValue, hint, type = 'text', textarea, rows = 3 }: { label: string; name: string; defaultValue: string; hint?: string; type?: string; textarea?: boolean; rows?: number }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {textarea
        ? <textarea name={name} defaultValue={defaultValue} rows={rows} className={`${inputCls} py-2`} />
        : <input name={name} type={type} defaultValue={defaultValue} className={inputCls} />}
      {hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function BrandForm({ action, brand }: { action: (s: State, f: FormData) => Promise<State>; brand: Brand }) {
  const [state, formAction] = useActionState(action, undefined);
  const faqs = [...brand.faqs, ...Array(Math.max(0, 4 - brand.faqs.length)).fill({ q: '', a: '' })].slice(0, 8);
  return (
    <form action={formAction} className="space-y-8">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">The basics</legend>
        <Field label="Business name" name="businessName" defaultValue={brand.businessName} />
        <label className="block text-sm font-medium">Type of business
          <select name="schemaType" defaultValue={brand.schemaType} className={inputCls}>
            {SCHEMA_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2"><Field label="What you do, in 1–3 sentences" name="description" defaultValue={brand.description} textarea hint="Write it the way you'd want ChatGPT to describe you. Facts only." /></div>
        <Field label="Services or products (one per line)" name="services" defaultValue={brand.services.join('\n')} textarea rows={5} />
        <Field label="Area served" name="areaServed" defaultValue={brand.areaServed} hint="e.g. Kathmandu Valley, or Nationwide" />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Contact and location</legend>
        <Field label="Phone" name="phone" defaultValue={brand.phone} />
        <Field label="Email" name="email" type="email" defaultValue={brand.email} />
        <Field label="Street address" name="street" defaultValue={brand.street} />
        <Field label="City" name="city" defaultValue={brand.city} />
        <Field label="Region / state" name="region" defaultValue={brand.region} />
        <Field label="Postal code" name="postalCode" defaultValue={brand.postalCode} />
        <Field label="Country" name="country" defaultValue={brand.country} />
        <Field label="Price range" name="priceRange" defaultValue={brand.priceRange} hint="e.g. $$ or $50–$200" />
        <Field label="Opening hours (one per line)" name="hours" defaultValue={brand.hours.join('\n')} textarea hint="Format: Mo-Fr 09:00-17:00" />
        <Field label="Social profiles and listings (one URL per line)" name="sameAs" defaultValue={brand.sameAs.join('\n')} textarea hint="Facebook, Instagram, LinkedIn, Google Maps, Yelp…" />
        <div className="sm:col-span-2"><Field label="Logo URL" name="logoUrl" type="url" defaultValue={brand.logoUrl} /></div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">Common questions</legend>
        <p className="text-sm text-muted">Questions customers really ask, answered in your words. Used in llms.txt and offered as FAQ markup.</p>
        {faqs.map((f, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input name={`faq_q_${i}`} defaultValue={f.q} placeholder="Question" aria-label={`Question ${i + 1}`} className={inputCls} />
            <input name={`faq_a_${i}`} defaultValue={f.a} placeholder="Answer" aria-label={`Answer ${i + 1}`} className={inputCls} />
          </div>
        ))}
      </fieldset>

      <div className="sticky bottom-0 -mx-1 flex items-center gap-4 border-t border-line bg-paper px-1 py-3">
        <Submit pending="Saving…">Save Brand Memory</Submit>
        <Notice state={state} />
      </div>
    </form>
  );
}
