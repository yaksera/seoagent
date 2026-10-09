import { lookup } from 'node:dns/promises';
import net from 'node:net';

// Blocks private, loopback, link-local, metadata and other non-public ranges so a
// user-supplied URL can't make the server fetch internal resources (SSRF).
function isBlockedV4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isBlockedV6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === '::' || x === '::1') return true;
  if (/^f[cd]/.test(x) || /^fe[89ab]/.test(x)) return true;
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isBlockedV4(mapped[1]) : false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedV4(ip);
  if (net.isIPv6(ip)) return isBlockedV6(ip);
  return true;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That does not look like a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https URLs are allowed');
  if (url.username || url.password) throw new Error('URLs with credentials are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error(`Could not resolve ${host}`);
  if (addresses.some(a => isBlockedIp(a.address))) throw new Error('This address is not allowed');
  return url;
}

export type FetchResult = {
  url: string;
  status: number;
  headers: Headers;
  body: string;
  redirectChain: { url: string; status: number }[];
  responseMs: number;
};

type Options = { userAgent: string; timeoutMs?: number; maxBytes?: number; maxRedirects?: number; readBody?: (contentType: string) => boolean };

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Follows redirects manually so every hop is re-checked against the blocklist.
export async function safeFetch(raw: string, opts: Options): Promise<FetchResult> {
  const { userAgent, timeoutMs = 15000, maxBytes = 3_000_000, maxRedirects = 5, readBody = () => true } = opts;
  const redirectChain: FetchResult['redirectChain'] = [];
  let current = raw;
  const started = Date.now();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' },
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      redirectChain.push({ url: url.href, status: res.status });
      await res.body?.cancel();
      current = new URL(location, url).href;
      continue;
    }
    const contentType = res.headers.get('content-type') ?? '';
    const body = readBody(contentType) ? await readCapped(res, maxBytes) : (await res.body?.cancel(), '');
    return { url: url.href, status: res.status, headers: res.headers, body, redirectChain, responseMs: Date.now() - started };
  }
  throw new Error('Too many redirects');
}
