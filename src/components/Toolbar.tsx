import { useStore } from '../store';
import type { ViewMode } from '../types';
import { download, pickFile, slug } from '../lib/files';
import { MAX_SVG_BYTES } from '../lib/svg';
import { goboMetrics, poseOf } from '../lib/geometry';
import { sceneRef } from './Viewport';
import { downloadOfflineCopy, offlineCopyAvailable, useOffline } from '../lib/offline';
import { SOURCE_URL } from '../lib/meta';
import { zip, type ZipEntry } from '../lib/zip';
import { Button, Toggle } from './controls';

export async function uploadSvg(file: File) {
  const { loadSvg, setStatus, gobos } = useStore.getState();
  if (file.size > MAX_SVG_BYTES) return setStatus({ kind: 'error', message: `“${file.name}” is larger than 5 MB.` });
  if (gobos.length && !confirm('Replace the current artwork and its gobos?')) return;
  await loadSvg(await file.text(), file.name);
}

// Samples are bundled into the app so they work offline and in the single-file copy.
const SAMPLES: Record<string, string> = import.meta.glob('../samples/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

async function loadSample(name: string) {
  const text = SAMPLES[`../samples/${name}`];
  if (useStore.getState().gobos.length && !confirm('Replace the current artwork and its gobos?')) return;
  await useStore.getState().loadSvg(text, name);
}

function slidePng(id: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const canvas = sceneRef.current?.slideCanvas(id, 2048);
    if (!canvas) return resolve(null);
    canvas.toBlob(async (b) => resolve(b ? new Uint8Array(await b.arrayBuffer()) : null), 'image/png');
  });
}

function placementReport() {
  const { gobos, room } = useStore.getState();
  const head = 'name,layer,color,gobo_diameter_mm,x_m,y_m,z_m,target_x_m,target_y_m,beam_deg,roll_deg,distance_m,h_angle_deg,v_angle_deg,keystone_h_pct,keystone_v_pct,throw_ratio';
  const rows = gobos.map((g) => {
    const m = goboMetrics(poseOf(g));
    const f = (n: number, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : '');
    return [
      `"${g.name.replace(/"/g, '""')}"`, g.layer, g.color, f(g.diameterMm, 1),
      f(g.position.x), f(g.position.y), f(g.position.z), f(g.target.x), f(g.target.y),
      f(g.fov, 2), f(g.roll, 2), f(m.distance), f(m.horizontalAngle, 2), f(m.verticalAngle, 2),
      f(m.keystoneH, 2), f(m.keystoneV, 2), f(m.throwRatio, 3),
    ].join(',');
  });
  const note = `# GoboLoom placement report (${SOURCE_URL}). Coordinates relative to the projection-wall center (${room.projectionWall} wall); z = distance from the wall.`;
  return [note, head, ...rows].join('\n');
}

/** One zip with everything needed to build the installation: slides, source artwork, report and project. */
async function exportPackage() {
  const { gobos, artwork, exportProject, setStatus } = useStore.getState();
  setStatus({ kind: 'busy', message: 'Packing export…' });
  try {
    const base = slug((artwork.fileName ?? 'gobo-loom').replace(/\.svg$/i, ''));
    const entries: ZipEntry[] = [];
    for (const g of gobos) {
      const png = await slidePng(g.id);
      if (png) entries.push({ name: `slides/${slug(g.name)}-${g.layer.slice(1)}-${g.diameterMm}mm.png`, data: png });
    }
    if (artwork.svg) entries.push({ name: `${base}.svg`, data: artwork.svg });
    entries.push({ name: 'gobo-placement.csv', data: placementReport() });
    entries.push({ name: 'gobo-loom-project.json', data: exportProject() });
    download(`${base}-gobos.zip`, new Blob([zip(entries)], { type: 'application/zip' }));
    setStatus({ kind: 'idle', message: '' });
  } catch (e) {
    setStatus({ kind: 'error', message: `Export failed: ${(e as Error).message}` });
  }
}

function OfflineStatus() {
  const { cache, online } = useOffline();
  if (!online)
    return (
      <span className="text-xs text-amber-300" title="No network: running from the offline cache">
        ● Offline
      </span>
    );
  if (cache === 'ready' && offlineCopyAvailable)
    return (
      <button
        type="button"
        className="text-xs text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
        title="Cached for offline use. A hard reload (Ctrl+F5) bypasses the cache; click to download a self-contained HTML copy that works without network, even after Ctrl+F5."
        onClick={() =>
          downloadOfflineCopy().catch((e) => useStore.getState().setStatus({ kind: 'error', message: (e as Error).message }))
        }
      >
        ● Offline ready
      </button>
    );
  if (cache === 'ready')
    return (
      <span className="text-xs text-emerald-400" title="Self-contained copy: works without any network">
        ● Offline ready
      </span>
    );
  if (cache === 'installing') return <span className="text-xs text-neutral-500">Caching for offline…</span>;
  return null;
}

export function Toolbar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const status = useStore((s) => s.status);
  const hasGobos = useStore((s) => s.gobos.length > 0);
  const hasSelection = useStore((s) => s.selectedId !== null);

  const modes: [ViewMode, string][] = [
    ['room', 'Room'],
    ['wall', 'Wall composite'],
    ['gobo', 'Gobo POV'],
  ];

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
      <div className="mr-2 flex items-baseline gap-2">
        <span className="bg-gradient-to-r from-red-400 via-yellow-300 to-sky-400 bg-clip-text text-lg font-bold text-transparent">
          GoboLoom
        </span>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
          title={SOURCE_URL}
        >
          source
        </a>
      </div>
      <Button variant="primary" onClick={() => pickFile('.svg,image/svg+xml').then((f) => f && uploadSvg(f))}>
        Upload SVG
      </Button>
      <Button
        onClick={() => loadSample('alpine-rgb.svg')}
        title="Alpine sunset from three red, green and blue gobos: overlaps mix into yellow, cyan, magenta and white"
      >
        Sample
      </Button>
      <Button onClick={() => loadSample('rgb-mix.svg')} title="Three overlapping red, green and blue squares: light mixes to white">
        RGB demo
      </Button>
      <Button
        onClick={() => loadSample('swissmicros-logo.svg')}
        title="SwissMicros logo in white, mixed from three aligned red, green and blue gobos"
      >
        Logo
      </Button>
      <span className="mx-1 h-5 w-px bg-neutral-800" />
      <Button
        onClick={() => pickFile('.json,application/json').then(async (f) => f && useStore.getState().loadProject(await f.text()))}
      >
        Open
      </Button>
      <Button onClick={() => download('gobo-loom-project.json', useStore.getState().exportProject(), 'application/json')}>
        Save
      </Button>
      <Button
        disabled={!hasGobos}
        onClick={exportPackage}
        title="Download a zip with each round gobo slide (pre-distorted mask, 2048 px PNG across the gobo diameter), the source SVG, the CSV placement report and the project file"
      >
        Export
      </Button>
      <span className="mx-1 h-5 w-px bg-neutral-800" />
      <div className="flex rounded bg-neutral-900 p-0.5">
        {modes.map(([m, label]) => (
          <button
            key={m}
            type="button"
            disabled={m === 'gobo' && !hasSelection}
            onClick={() => setView({ mode: m })}
            className={`rounded px-2 py-1 text-xs disabled:opacity-40 ${view.mode === m ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Toggle label="Wireframe" checked={view.wireframe} onChange={(v) => setView({ wireframe: v })} />
        <Toggle label="Beams" checked={view.beams} onChange={(v) => setView({ beams: v })} />
        <Toggle label="Icons" checked={view.icons} onChange={(v) => setView({ icons: v })} />
        <Toggle label="Grid" checked={view.grid} onChange={(v) => setView({ grid: v })} />
        <Toggle label="Composite" checked={view.compositeInset} onChange={(v) => setView({ compositeInset: v })} title="Wall composite inset" />
        <Toggle label="Reference" checked={view.reference} onChange={(v) => setView({ reference: v })} title="Overlay the original SVG on the wall" />
        <Toggle label="Previews" checked={view.previews} onChange={(v) => setView({ previews: v })} title="Live preview of each round gobo slide" />
        <Toggle label="Diagnostics" checked={view.diagnostic} onChange={(v) => setView({ diagnostic: v })} />
        <Toggle
          label="Falloff"
          checked={view.physicalFalloff}
          onChange={(v) => setView({ physicalFalloff: v })}
          title="Physical inverse-square and incidence-angle brightness falloff (normalized at each aim point)"
        />
      </div>
      <span className="ml-auto" />
      <OfflineStatus />
      {status.message && (
        <span
          className={`max-w-[40ch] truncate text-xs ${
            status.kind === 'error' ? 'text-red-400' : status.kind === 'busy' ? 'text-sky-300' : 'text-neutral-400'
          }`}
          title={status.message}
        >
          {status.message}
        </span>
      )}
    </header>
  );
}
