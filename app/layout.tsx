import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import './globals.css';

const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: 'SEO Agent: find and fix what holds your site back',
  description: 'Crawl your site, see the SEO problems in plain English, and get fixes you can publish or paste.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" className={`${plex.variable} ${plexMono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <Link href={session ? '/app' : '/'} className="font-semibold tracking-tight">SEO Agent</Link>
            <nav aria-label="Account" className="flex items-center gap-4 text-sm">
              {session ? <Link href="/app" className="hover:text-accent">Dashboard</Link> : (
                <>
                  <Link href="/pricing" className="hover:text-accent">Pricing</Link>
                  <Link href="/login" className="hover:text-accent">Log in</Link>
                  <Link href="/signup" className="rounded-md bg-ink px-3 py-1.5 text-white hover:bg-accent">Free trial</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-5xl flex-wrap gap-4 px-4 py-6 text-sm text-muted">
            <span>© {new Date().getFullYear()} SEO Agent</span>
            <Link href="/pricing" className="hover:text-ink">Pricing</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/bot" className="hover:text-ink">Our crawler</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
