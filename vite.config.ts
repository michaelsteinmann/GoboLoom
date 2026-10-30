import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync } from 'node:fs';

const SOURCE_URL = 'https://github.com/michaelsteinmann/GoboLoom';
/** Marks the single-file build so the download can verify it got the real thing. */
const OFFLINE_MARKER = 'gobo-loom-offline-single-file';

/** Adds the source reference (and, for the single-file build, its marker) to index.html. */
function htmlMeta(singleFile: boolean): Plugin {
  return {
    name: 'gobo-loom-html-meta',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replace('<!doctype html>', `<!doctype html>\n<!-- GoboLoom · source: ${SOURCE_URL} -->`)
          .replace(
            '<title>',
            `<meta name="source" content="${SOURCE_URL}" />\n    ` +
              (singleFile ? `<meta name="gobo-loom-build" content="${OFFLINE_MARKER}" />\n    ` : '') +
              '<title>',
          ),
    },
  };
}

/** Self-contained copy of the app (`vite build --mode offline`), shipped next to the site. */
const OFFLINE_FILE = 'gobo-loom-offline.html';
const OFFLINE_DIR = 'dist-offline';

function serviceWorkerSource(cache: string, assets: string[]) {
  return `// Generated at build time: precaches the whole app so it runs offline after the first visit.
const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gobo-loom-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first so updates arrive; the precached page when offline.
    event.respondWith(fetch(req).catch(() => caches.match('./', { cacheName: CACHE })));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
`;
}

/** Emits sw.js precaching every built file, and ships the single-file offline copy. */
function offlineSupport(): Plugin {
  const offlineSrc = `${OFFLINE_DIR}/index.html`;
  return {
    name: 'gobo-loom-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).sort();
      const hash = createHash('sha256');
      for (const f of files) {
        const item = bundle[f];
        hash.update(f).update(item.type === 'chunk' ? item.code : item.source);
      }
      const assets = ['./', ...files.filter((f) => f !== 'index.html').map((f) => `./${f}`)];
      if (existsSync(offlineSrc)) assets.push(`./${OFFLINE_FILE}`);
      else this.warn(`${offlineSrc} not found; run "vite build --mode offline" first to ship the offline copy.`);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(`gobo-loom-${hash.digest('hex').slice(0, 12)}`, assets),
      });
    },
    writeBundle(options) {
      if (existsSync(offlineSrc)) copyFileSync(offlineSrc, `${options.dir}/${OFFLINE_FILE}`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative asset paths so the build works under any subpath (e.g. GitHub Pages /GoboLoom/).
  base: './',
  plugins:
    mode === 'offline'
      ? [react(), tailwindcss(), htmlMeta(true), viteSingleFile()]
      : [react(), tailwindcss(), htmlMeta(false), offlineSupport()],
  build: mode === 'offline' ? { outDir: OFFLINE_DIR, emptyOutDir: true } : {},
  test: {
    environment: 'jsdom',
    globals: true,
  },
}));
