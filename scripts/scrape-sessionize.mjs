#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = { catalog: resolve(root, 'src/data/catalog.json'), out: resolve(root, '.sessionize-downloads'), endpoint: 'https://sessionize.com/api/v2/cdpvhngf/session', delay: 1000, attempts: 3, timeout: 20000, force: false };
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`Download Sessionize HTML using an empty POST per catalog session. Requires Node >=20.19.
Usage: node scripts/scrape-sessionize.mjs [options]
  --out PATH       Output directory (default: .sessionize-downloads)
  --catalog PATH   Input catalog JSON
  --endpoint URL   Session endpoint (default: official event URL)
  --delay MS       Pause between requests (default: 1000)
  --attempts N     Attempts per session (default: 3)
  --timeout MS     Request timeout (default: 20000)
  --force          Download again, ignoring cached results

Writes one JSON file per session, sessions.json and errors.json. Existing valid
results are reused. The original catalog is never modified. A partial run exits 1.
HTML is preserved as returned; sanitize it before rendering in an application.`);
  process.exit(0);
}
for (let i = 0; i < args.length; i++) {
  const key = args[i].replace(/^--/, '');
  if (args[i] === '--force') { options.force = true; continue; }
  if (!args[i].startsWith('--') || !['catalog', 'out', 'endpoint', 'delay', 'attempts', 'timeout'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Invalid argument: ${args[i]}; see --help`);
  options[key] = ['delay', 'attempts', 'timeout'].includes(key) ? Number(args[++i]) : args[++i];
}
for (const key of ['delay', 'attempts', 'timeout']) if (!Number.isSafeInteger(options[key]) || options[key] < (key === 'delay' ? 0 : 1)) throw new Error(`Invalid ${key}`);
const endpoint = new URL(options.endpoint);
if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error('Endpoint must use HTTP(S)');
const catalog = JSON.parse(await readFile(resolve(options.catalog), 'utf8'));
if (!Array.isArray(catalog.sessions)) throw new Error('Catalog must contain sessions[]');
const ids = new Set();
for (const session of catalog.sessions) {
  if (typeof session.id !== 'string' || !/^\d+$/.test(session.id) || ids.has(session.id)) throw new Error(`Invalid or duplicate session id: ${session.id}`);
  ids.add(session.id);
}
const out = resolve(options.out);
await mkdir(out, { recursive: true });
async function save(path, value) {
  await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  await rename(path + '.tmp', path);
}
const results = [], errors = [];
let lastRequest = 0;
for (const [index, session] of catalog.sessions.entries()) {
  const url = new URL(endpoint); url.searchParams.set('id', session.id);
  const path = resolve(out, `${session.id}.json`);
  if (!options.force) {
    try {
      const cached = JSON.parse(await readFile(path, 'utf8'));
      if (cached.id === session.id && cached.sourceUrl === url.href && typeof cached.contentHtml === 'string' && cached.contentHtml.trim() && cached.retrievedAt) {
        results.push(cached); console.log(`[${index + 1}/${ids.size}] ${session.id}: cached`); continue;
      }
    } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  }
  let failure;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    let retryWait = options.delay * attempt;
    try {
      await pause(Math.max(0, options.delay - (Date.now() - lastRequest)));
      lastRequest = Date.now();
      const response = await fetch(url, {
        method: 'POST', body: '', signal: AbortSignal.timeout(options.timeout),
        headers: { Accept: 'text/html', Origin: 'https://conferences.codemotion.com', Referer: 'https://conferences.codemotion.com/' },
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const ms = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
          if (Number.isFinite(ms)) retryWait = Math.max(retryWait, ms);
        }
        await response.body?.cancel();
        throw error;
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/html')) throw Object.assign(new Error(`Unexpected content type: ${contentType}`), { retryable: false });
      const contentHtml = await response.text();
      if (!contentHtml.trim()) throw Object.assign(new Error('Empty response'), { retryable: false });
      const result = { id: session.id, title: session.title, sourceUrl: url.href, retrievedAt: new Date().toISOString(), contentType, contentHtml };
      await save(path, result); results.push(result); failure = null;
      console.log(`[${index + 1}/${ids.size}] ${session.id}: downloaded`); break;
    } catch (error) {
      // Filesystem failures must not be treated as recoverable network errors.
      if (error.code && ['EACCES', 'ENOSPC', 'EROFS', 'EIO'].includes(error.code)) throw error;
      failure = `${error.message}${error.cause?.message ? ': ' + error.cause.message : ''}`;
      console.error(`${session.id}, attempt ${attempt}: ${failure}`);
      if (error.retryable === false || attempt === options.attempts) break;
      await pause(retryWait);
    }
  }
  if (failure) errors.push({ id: session.id, title: session.title, sourceUrl: url.href, error: failure });
}
await save(resolve(out, 'sessions.json'), { eventId: catalog.event?.id, generatedAt: new Date().toISOString(), sessions: results });
await save(resolve(out, 'errors.json'), errors);
console.log(`Complete: ${results.length}/${ids.size} sessions, ${errors.length} errors. Output: ${out}`);
if (errors.length) process.exitCode = 1;
