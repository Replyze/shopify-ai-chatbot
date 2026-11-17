/**
 * Checks the theme app extension the way `shopify theme check` does (with
 * Shopify's theme-check, theme-app-extension rules), plus Shopify's size
 * limits. Errors fail the run; warnings are printed.
 *
 * RemoteAsset is expected: widget.js comes from cdn.replyze.chat on purpose,
 * so the store always runs Replyze's current widget.
 *
 *   npm run check:extension
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Severity, themeCheckRun } from '@shopify/theme-check-node';

const root = fileURLToPath(new URL('../extensions/replyze-chat-embed', import.meta.url));
const EXPECTED_WARNINGS = new Set(['RemoteAsset']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

// Shopify's limits for a theme app extension: 10 MB in all, 100 KB of Liquid, 15 KB per locale file.
const all = files(root);
const total = all.reduce((sum, f) => sum + statSync(f).size, 0);
const liquid = all.filter((f) => f.endsWith('.liquid')).reduce((sum, f) => sum + statSync(f).size, 0);
const problems: string[] = [];
if (total > 10 * 1024 * 1024) problems.push(`The extension is ${total} bytes; the limit is 10 MB.`);
if (liquid > 100 * 1024) problems.push(`The extension has ${liquid} bytes of Liquid; the limit is 100 KB.`);
for (const locale of all.filter((f) => f.includes(`${join('locales', '')}`))) {
  if (statSync(locale).size > 15 * 1024) problems.push(`${relative(root, locale)} is over 15 KB.`);
  JSON.parse(readFileSync(locale, 'utf8'));
}

const run = await themeCheckRun(root, undefined, () => undefined); // shopify.extension.toml there picks Shopify's theme-app-extension rules
let warnings = 0;
for (const offense of run.offenses) {
  const where = `${relative(root, fileURLToPath(offense.uri))}:${offense.start.line + 1}`;
  if (offense.severity === Severity.ERROR) {
    problems.push(`${offense.check} at ${where}: ${offense.message}`);
  } else if (!EXPECTED_WARNINGS.has(offense.check)) {
    warnings++;
    console.warn(`warning ${offense.check} at ${where}: ${offense.message}`);
  }
}

console.log(`Theme app extension: ${all.length} files, ${total} bytes (${liquid} bytes of Liquid), ${run.offenses.length} theme-check findings (RemoteAsset expected).`);
if (problems.length) {
  console.error(problems.map((p) => `error ${p}`).join('\n'));
  process.exit(1);
}
if (warnings) console.warn(`${warnings} unexpected warning(s).`);
