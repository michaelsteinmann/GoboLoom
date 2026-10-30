import { useStore } from '../store';
import type { ViewMode } from '../types';
import { download, pickFile, slug } from '../lib/files';
import { MAX_SVG_BYTES } from '../lib/svg';
import { goboMetrics, poseOf } from '../lib/geometry';
import { sceneRef } from './Viewport';
import { Button, Toggle } from './controls';

export async function uploadSvg(file: File) {
  const { loadSvg, setStatus, gobos } = useStore.getState();
  if (file.size > MAX_SVG_BYTES) return setStatus({ kind: 'error', message: `“${file.name}” is larger than 5 MB.` });
  if (gobos.length && !confirm('Replace the current artwork and its gobos?')) return;
  await loadSvg(await file.text(), file.name);
}

async function loadSample(name: string) {
  const text = await fetch(`${import.meta.env.BASE_URL}samples/${name}`).then((r) => r.text());
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
  const note = `# GoboLoom placement report. Coordinates relative to the projection-wall center (${room.projectionWall} wall); z = distance from the wall.`;
  download('gobo-placement.csv', [note, head, ...rows].join('\n'), 'text/csv');
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
      {status.message && (
        <span
          className={`ml-auto max-w-[40ch] truncate text-xs ${
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
