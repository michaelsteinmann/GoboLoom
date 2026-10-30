import { useStore } from '../store';
import type { ViewMode } from '../types';
import { download, pickFile, slug } from '../lib/files';
import { MAX_SVG_BYTES } from '../lib/svg';
import { goboMetrics, poseOf } from '../lib/geometry';
import { sceneRef } from './Viewport';
import { downloadOfflineCopy, isSingleFile, offlineCopyAvailable, useOffline } from '../lib/offline';
import { SOURCE_URL } from '../lib/meta';
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

function exportSlides() {
  const { gobos } = useStore.getState();
  for (const g of gobos) {
    const canvas = sceneRef.current?.slideCanvas(g.id, 2048);
    canvas?.toBlob((b) => b && download(`${slug(g.name)}-${g.layer.slice(1)}-${g.diameterMm}mm.png`, b), 'image/png');
  }
}

function exportReport() {
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
  download('gobo-placement.csv', [note, head, ...rows].join('\n'), 'text/csv');
}

function OfflineStatus() {
  const { cache, online } = useOffline();
  if (!online)
    return (
      <span className="text-xs text-amber-300" title="No network: running from the offline cache">
        ● Offline
      </span>
    );
  if (cache === 'ready')
    return (
      <span
        className="text-xs text-emerald-400"
        title={
          isSingleFile
            ? 'Self-contained copy: works without any network'
            : 'Cached for offline use. A hard reload (Ctrl+F5) bypasses the cache; use the offline copy for that.'
        }
      >
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
      <Button onClick={() => loadSample('rgb-mix.svg')} title="Three overlapping red, green and blue circles: light mixes to white">
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
      <Button disabled={!hasGobos} onClick={exportSlides} title="Download each round gobo slide (pre-distorted mask) as a 2048 px PNG spanning the gobo diameter">
        Export slides
      </Button>
      {!isSingleFile && (
        <Button
          disabled={!offlineCopyAvailable}
          onClick={() =>
            downloadOfflineCopy().catch((e) => useStore.getState().setStatus({ kind: 'error', message: (e as Error).message }))
          }
          title={
            offlineCopyAvailable
              ? 'Download a single self-contained HTML file that works without network, even after Ctrl+F5'
              : 'Only available in the built site (npm run build), not on the dev server'
          }
        >
          Offline copy
        </Button>
      )}
      <Button disabled={!hasGobos} onClick={exportReport} title="Download a CSV placement report for installation">
        Report
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
