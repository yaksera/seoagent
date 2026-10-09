import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CrawlResult } from './crawler';
import type { Issue } from './rules';
import type { PageFix } from './fixes';

// MVP storage: one JSON file per audit. Swap for Postgres (docs/REQUIREMENTS.md §4) later.
export type Audit = {
  id: string;
  createdAt: string;
  durationMs: number;
  score: number;
  issues: Issue[];
  crawl: CrawlResult;
  fixes: Record<string, PageFix>;
};

const DIR = path.join(process.cwd(), 'data', 'audits');
const ID = /^[0-9a-f-]{36}$/;

export async function saveAudit(audit: Audit) {
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, `${audit.id}.json`), JSON.stringify(audit));
}

export async function loadAudit(id: string): Promise<Audit | null> {
  if (!ID.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(DIR, `${id}.json`), 'utf8')) as Audit;
  } catch {
    return null;
  }
}
