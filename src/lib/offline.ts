import { create } from 'zustand';
import { download } from './files';

/** True in the self-contained single-file build: everything is inline, no network needed. */
export const isSingleFile = import.meta.env.MODE === 'offline';

export const OFFLINE_FILE = 'gobo-loom-offline.html';
/** Set by the single-file build (see vite.config.ts); proves a download is the real copy. */
const OFFLINE_MARKER = 'gobo-loom-offline-single-file';

/** The copy only exists in production builds; the dev server would answer with its own page. */
export const offlineCopyAvailable = import.meta.env.PROD && !isSingleFile;

interface OfflineState {
  cache: 'none' | 'installing' | 'ready';
  online: boolean;
}

export const useOffline = create<OfflineState>(() => ({
  cache: isSingleFile ? 'ready' : 'none',
  online: navigator.onLine,
}));

/** Track connectivity and, on the hosted site, install the service worker that caches the app. */
export function setupOffline() {
  addEventListener('online', () => useOffline.setState({ online: true }));
  addEventListener('offline', () => useOffline.setState({ online: false }));
  if (isSingleFile || !import.meta.env.PROD || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  useOffline.setState({ cache: 'installing' });
  navigator.serviceWorker
    .register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => useOffline.setState({ cache: 'ready' }))
    .catch(() => useOffline.setState({ cache: 'none' }));
}

/** Save the self-contained HTML copy, which also works from disk and survives hard reloads. */
export async function downloadOfflineCopy() {
  const res = await fetch(`./${OFFLINE_FILE}`);
  const html = res.ok ? await res.text() : '';
  if (!html.includes(`<meta name="gobo-loom-build" content="${OFFLINE_MARKER}"`))
    throw new Error('The offline copy is not available here; it is produced by "npm run build" and published with the site.');
  download(OFFLINE_FILE, html, 'text/html');
}
