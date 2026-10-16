import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
async function allFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) result.push(...await allFiles(path));
    else if (e.isFile() && e.name !== 'sw.js') result.push(path);
  }
  return result;
}
const paths = (await allFiles(root)).sort();
if (!paths.some(path => path.endsWith('index.html'))) throw new Error('Missing dist/index.html: run vite build first');
if (!paths.some(path => path.endsWith('manifest.webmanifest'))) throw new Error('Missing PWA manifest');
const urls = paths.map(path => '/' + relative(root, path).split(sep).join('/'));
const digest = createHash('sha256');
for (const file of paths) { digest.update(relative(root,file)); digest.update(await readFile(file)); }
const revision = digest.digest('hex').slice(0, 14);
const code = `/* Generated from Vite dist: ${revision}. Do not edit directly. */
const CACHE = 'codepath-offline-${revision}';
const PREFIX = 'codepath-offline-';
const PRECACHE = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) return response;
      } catch { /* offline: fall back to cached SPA shell */ }
      return (await caches.match('/index.html')) || Response.error();
    })());
    return;
  }
  event.respondWith((async () => {
    const hit = await caches.match(request, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(request); }
    catch { return Response.error(); }
  })());
});
`;
await writeFile(join(root, 'sw.js'), code);
console.log(`Generated PWA service worker (revision ${revision}; precached ${urls.length} files).`);
