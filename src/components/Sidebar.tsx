import { useStore } from '../store';
import { artworkRect, surfaceDims } from '../lib/geometry';
import type { WallSide } from '../types';
import { Button, NumberField, Section, Slider, Toggle } from './controls';

function RoomSection() {
  const room = useStore((s) => s.room);
  const setRoom = useStore((s) => s.setRoom);
  const ambient = useStore((s) => s.view.ambient);
  const setView = useStore((s) => s.setView);
  const aspect = useStore((s) => s.artwork.aspect);
  const scale = useStore((s) => s.artwork.scale);
  const art = artworkRect(room, aspect, scale);
  const dims = surfaceDims(room);
  return (
    <Section title="Room & projection wall">
      <div className="flex gap-2">
        <NumberField label="W" value={room.width} min={1} max={100} step={0.1} onChange={(width) => setRoom({ width })} />
        <NumberField label="D" value={room.depth} min={1} max={100} step={0.1} onChange={(depth) => setRoom({ depth })} />
        <NumberField label="H" value={room.height} min={1} max={50} step={0.1} onChange={(height) => setRoom({ height })} />
      </div>
      <label className="flex items-center justify-between text-xs text-neutral-400">
        Projection wall
        <select
          className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-neutral-100"
          value={room.projectionWall}
          onChange={(e) => setRoom({ projectionWall: e.target.value as WallSide })}
        >
          {(['north', 'south', 'east', 'west'] as const).map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <Slider label="Ambient light" value={ambient} min={0} max={0.6} onChange={(v) => setView({ ambient: v })} />
      <div className="rounded bg-neutral-900 p-2 font-mono text-[11px] leading-relaxed text-neutral-400">
        <div>
          surface {dims.width.toFixed(2)} × {dims.height.toFixed(2)} m
        </div>
        <div>room depth {dims.depth.toFixed(2)} m</div>
        <div>center (0, 0, 0) · normal +z</div>
        <div>uv (0,0) bottom-left</div>
        <div>uv (1,1) top-right</div>
        <div>
          artwork {art.w.toFixed(2)} × {art.h.toFixed(2)} m
        </div>
      </div>
    </Section>
  );
}

function ArtworkSection() {
  const artwork = useStore((s) => s.artwork);
  const gobos = useStore((s) => s.gobos);
  const setArtworkScale = useStore((s) => s.setArtworkScale);
  const setOverlapMode = useStore((s) => s.setOverlapMode);
  const reference = useStore((s) => s.view.reference);
  const referenceOpacity = useStore((s) => s.view.referenceOpacity);
  const setView = useStore((s) => s.setView);
  const addGobo = useStore((s) => s.addGobo);
  return (
    <Section title="Artwork & palette">
      {artwork.svg ? (
        <>
          <div className="truncate text-xs text-neutral-300" title={artwork.fileName ?? ''}>
            {artwork.fileName} <span className="text-neutral-500">· aspect {artwork.aspect.toFixed(3)}</span>
          </div>
          <Slider label="Size on wall" value={artwork.scale} min={0.1} max={1} onChange={setArtworkScale} />
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>Overlaps</span>
            <div className="flex gap-1">
              <Toggle
                label="Occlude"
                checked={artwork.blend === 'occlude'}
                onChange={() => setOverlapMode('occlude')}
                title="Top shape hides what is beneath; gobos never overlap"
              />
              <Toggle
                label="Mix light"
                checked={artwork.blend === 'additive'}
                onChange={() => setOverlapMode('additive')}
                title="Each gobo projects its full shapes; overlapping light adds up (R+G+B = white)"
              />
            </div>
          </div>
          {reference && (
            <Slider
              label="Reference overlay opacity"
              value={referenceOpacity}
              min={0.05}
              max={1}
              onChange={(v) => setView({ referenceOpacity: v })}
            />
          )}
          <ul className="space-y-1">
            {artwork.palette.map((p) => {
              const count = gobos.filter((g) => g.layer === p.hex).length;
              return (
                <li key={p.hex} className="flex items-center gap-2 text-xs">
                  <span className="h-4 w-4 shrink-0 rounded ring-1 ring-neutral-600" style={{ background: p.hex }} />
                  <span className="font-mono text-neutral-200">{p.hex}</span>
                  <span className="text-neutral-500">
                    {p.shapeCount} shape{p.shapeCount === 1 ? '' : 's'}
                  </span>
                  <span className="ml-auto">
                    {p.projectable ? (
                      <button
                        type="button"
                        className="text-sky-400 hover:text-sky-300"
                        title="Add another gobo for this color"
                        onClick={() => addGobo(p.hex)}
                      >
                        {count} gobo{count === 1 ? '' : 's'} +
                      </button>
                    ) : (
                      <span className="text-neutral-500">unlit</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {artwork.warnings.map((w) => (
            <p key={w} className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
              ⚠ {w}
            </p>
          ))}
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          No artwork yet. Upload an SVG with solid-color fills; each unique color becomes one gobo.
        </p>
      )}
    </Section>
  );
}

function GoboList() {
  const gobos = useStore((s) => s.gobos);
  const selectedId = useStore((s) => s.selectedId);
  const soloId = useStore((s) => s.view.soloId);
  const select = useStore((s) => s.select);
  const updateGobo = useStore((s) => s.updateGobo);
  const setView = useStore((s) => s.setView);
  const bakeAll = useStore((s) => s.bakeAll);
  return (
    <Section
      title={`Gobos (${gobos.length})`}
      right={
        gobos.length > 0 && (
          <Button onClick={bakeAll} title="Pre-correct every slide for its current position">
            Bake all
          </Button>
        )
      }
    >
      <ul className="space-y-1">
        {gobos.map((g) => (
          <li
            key={g.id}
            onClick={() => select(g.id)}
            className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs ${
              g.id === selectedId ? 'bg-sky-900/40 ring-1 ring-sky-600/60' : 'hover:bg-neutral-800'
            }`}
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} />
            <span className={`truncate ${g.visible ? 'text-neutral-100' : 'text-neutral-500 line-through'}`}>{g.name}</span>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                title="Solo"
                className={`rounded px-1 ${soloId === g.id ? 'bg-amber-500/30 text-amber-200' : 'text-neutral-500 hover:text-neutral-200'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setView({ soloId: soloId === g.id ? null : g.id });
                }}
              >
                S
              </button>
              <button
                type="button"
                title={g.visible ? 'Hide' : 'Show'}
                className="rounded px-1 text-neutral-500 hover:text-neutral-200"
                onClick={(e) => {
                  e.stopPropagation();
                  updateGobo(g.id, { visible: !g.visible });
                }}
              >
                {g.visible ? '●' : '○'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Sidebar() {
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-950">
      <RoomSection />
      <ArtworkSection />
      <GoboList />
    </aside>
  );
}
