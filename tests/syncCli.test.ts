import { describe, expect, it } from 'vitest';
import { parseArgs } from '../scripts/sync-knowledge.ts';

describe('sync-knowledge options', () => {
  it('syncs policies and every page, published, by default', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, status: 'published', collect: { policies: true, pages: true } });
  });

  it('reads each option', () => {
    expect(parseArgs(['--dry-run', '--draft', '--pages=faq, contact'])).toEqual({
      dryRun: true,
      status: 'draft',
      collect: { policies: true, pages: ['faq', 'contact'] },
    });
    expect(parseArgs(['--no-pages']).collect).toEqual({ policies: true, pages: false });
  });

  it('refuses unknown options and an empty selection', () => {
    expect(() => parseArgs(['--force'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['--pages='])).toThrow(/needs page handles/);
    expect(() => parseArgs(['--no-pages', '--no-policies'])).toThrow(/Nothing to sync/);
  });
});
