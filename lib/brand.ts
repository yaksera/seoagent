import { z } from 'zod';
import type { CrawlResult } from './crawler';

// Brand Memory: facts the owner confirms. AI output and the AI feed may only use these.
export const SCHEMA_TYPES = [
  'LocalBusiness', 'Organization', 'ProfessionalService', 'Store', 'Restaurant', 'HomeAndConstructionBusiness', 'MedicalBusiness',
  'Dentist', 'LegalService', 'AutomotiveBusiness', 'LodgingBusiness', 'TravelAgency', 'EducationalOrganization', 'FinancialService', 'BeautySalon',
] as const;

const lines = (max: number, each = 200) => z.string().max(max * (each + 2)).transform(s => s.split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, max));
const url = z.string().trim().url().max(500);

export const brandForm = z.object({
  businessName: z.string().trim().min(1, 'Enter the business name').max(120),
  schemaType: z.enum(SCHEMA_TYPES),
  description: z.string().trim().max(600),
  services: lines(20, 120),
  areaServed: z.string().trim().max(200),
  street: z.string().trim().max(200),
  city: z.string().trim().max(100),
  region: z.string().trim().max(100),
  postalCode: z.string().trim().max(20),
  country: z.string().trim().max(60),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]),
  hours: lines(10, 60),
  priceRange: z.string().trim().max(20),
  logoUrl: z.union([z.literal(''), url]),
  sameAs: lines(10, 300).pipe(z.array(url)),
});

export type Faq = { q: string; a: string };
export type Brand = z.infer<typeof brandForm> & { faqs: Faq[] };

export function parseBrandForm(form: FormData): { data?: Brand; error?: string } {
  const parsed = brandForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: i.path[0] === 'sameAs' ? 'Social profile links must be full URLs, one per line.' : i.message };
  }
  const faqs: Faq[] = [];
  for (let i = 0; i < 8; i++) {
    const q = String(form.get(`faq_q_${i}`) ?? '').trim().slice(0, 200);
    const a = String(form.get(`faq_a_${i}`) ?? '').trim().slice(0, 800);
    if (q && a) faqs.push({ q, a });
  }
  return { data: { ...parsed.data, faqs } };
}

export const emptyBrand = (): Brand => ({
  businessName: '', schemaType: 'LocalBusiness', description: '', services: [], areaServed: '', street: '', city: '', region: '',
  postalCode: '', country: '', phone: '', email: '', hours: [], priceRange: '', logoUrl: '', sameAs: [], faqs: [],
});

// First guess from the crawl, for the owner to confirm. Never published until saved.
export function prefillFromCrawl(crawl: CrawlResult | null): Brand {
  const b = emptyBrand();
  if (!crawl) return b;
  const home = crawl.pages.find(p => p.finalUrl === crawl.startUrl) ?? crawl.pages[0];
  if (!home) return b;
  b.businessName = home.title.split(/\s[|–—-]\s/).pop()?.trim().slice(0, 120) || crawl.host;
  b.description = home.metaDescription.slice(0, 600);
  b.phone = crawl.pages.flatMap(p => p.phones ?? [])[0] ?? '';
  b.email = crawl.pages.flatMap(p => p.emails ?? [])[0] ?? '';
  b.sameAs = [...new Set(crawl.pages.flatMap(p => p.socialLinks ?? []))].slice(0, 10);
  return b;
}

const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && v.length === 0)));

export function buildJsonLd(brand: Brand, siteUrl: string) {
  const address = brand.street || brand.city ? clean({
    '@type': 'PostalAddress', streetAddress: brand.street, addressLocality: brand.city, addressRegion: brand.region, postalCode: brand.postalCode, addressCountry: brand.country,
  }) : undefined;
  const isLocal = brand.schemaType !== 'Organization' && brand.schemaType !== 'EducationalOrganization';
  return clean({
    '@context': 'https://schema.org',
    '@type': brand.schemaType,
    '@id': `${siteUrl.replace(/\/$/, '')}/#organization`,
    name: brand.businessName,
    url: siteUrl,
    logo: brand.logoUrl,
    ...(isLocal && brand.logoUrl ? { image: brand.logoUrl } : {}),
    description: brand.description,
    telephone: brand.phone,
    email: brand.email,
    address,
    areaServed: brand.areaServed,
    ...(isLocal ? { priceRange: brand.priceRange, openingHours: brand.hours } : {}),
    makesOffer: brand.services.length ? brand.services.map(s => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s } })) : undefined,
    sameAs: brand.sameAs,
  });
}

// FAQ markup must only go on a page that visibly shows the same questions (Google's rules).
export function buildFaqJsonLd(faqs: Faq[]) {
  if (!faqs.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}

export function buildLlmsTxt(brand: Brand, crawl: CrawlResult | null) {
  const out: string[] = [`# ${brand.businessName}`, ''];
  if (brand.description) out.push(`> ${brand.description.replace(/\s+/g, ' ')}`, '');
  const facts = [
    brand.areaServed && `Serves: ${brand.areaServed}`,
    [brand.street, brand.city, brand.region, brand.postalCode, brand.country].filter(Boolean).join(', ') && `Address: ${[brand.street, brand.city, brand.region, brand.postalCode, brand.country].filter(Boolean).join(', ')}`,
    brand.phone && `Phone: ${brand.phone}`,
    brand.email && `Email: ${brand.email}`,
    brand.hours.length > 0 && `Hours: ${brand.hours.join('; ')}`,
    brand.priceRange && `Price range: ${brand.priceRange}`,
  ].filter(Boolean) as string[];
  if (facts.length) out.push(...facts.map(f => `- ${f}`), '');
  if (brand.services.length) out.push('## Services', '', ...brand.services.map(s => `- ${s}`), '');
  const pages = (crawl?.pages ?? [])
    .filter(p => p.isHtml && p.status >= 200 && p.status < 300 && p.title && !/noindex/.test(p.metaRobots + p.xRobotsTag))
    .slice(0, 30);
  if (pages.length) {
    out.push('## Key pages', '');
    for (const p of pages) out.push(`- [${p.title.replace(/[[\]]/g, '')}](${p.finalUrl})${p.metaDescription ? `: ${p.metaDescription.replace(/\s+/g, ' ')}` : ''}`);
    out.push('');
  }
  if (brand.faqs.length) {
    out.push('## Frequently asked questions', '');
    for (const f of brand.faqs) out.push(`### ${f.q}`, '', f.a, '');
  }
  if (brand.sameAs.length) out.push('## Elsewhere', '', ...brand.sameAs.map(s => `- ${s}`), '');
  return out.join('\n').trim() + '\n';
}

// Facts block for AI prompts: the model may only use what is here.
export function brandFacts(brand: Brand | null) {
  if (!brand?.businessName) return '';
  return [
    `name: ${brand.businessName}`, `type: ${brand.schemaType}`, brand.description && `about: ${brand.description}`,
    brand.services.length > 0 && `services: ${brand.services.join(', ')}`, brand.areaServed && `area served: ${brand.areaServed}`,
    brand.city && `location: ${[brand.city, brand.country].filter(Boolean).join(', ')}`, brand.phone && `phone: ${brand.phone}`,
    brand.priceRange && `price range: ${brand.priceRange}`,
  ].filter(Boolean).join('\n');
}
