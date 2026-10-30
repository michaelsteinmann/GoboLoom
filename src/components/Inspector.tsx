import { useStore } from '../store';
import { artworkRect, goboMetrics, poseOf } from '../lib/geometry';
import { artworkOnGobo } from '../lib/slide';
import { normalizeColor } from '../lib/color';
import { DEFAULT_CALIBRATION, TYPICAL_BEAM_MAX_DEG, TYPICAL_BEAM_MIN_DEG } from '../lib/defaults';
import type { Calibration, Gobo, GoboPose } from '../types';
import { Button, NumberField, Readout, Section, Slider, Toggle } from './controls';

const fmt = (n: number, d = 2, unit = '') => (Number.isFinite(n) ? `${n.toFixed(d)}${unit}` : '—');

function poseDrift(g: Gobo): boolean {
  const p = g.correction.pose;
  if (!g.correction.enabled || !p) return false;
  const now: GoboPose = poseOf(g);
  return JSON.stringify(now) !== JSON.stringify(p);
}

export function Metrics({ gobo }: { gobo: Gobo }) {
  const m = goboMetrics(poseOf(gobo));
  return (
    <div className="space-y-0.5">
      <Readout label="Distance to aim point" value={fmt(m.distance, 3, ' m')} />
      <Readout label="Horizontal incidence" value={fmt(m.horizontalAngle, 1, '°')} />
      <Readout label="Vertical incidence" value={fmt(m.verticalAngle, 1, '°')} />
      <Readout label="Total off-axis" value={fmt(m.incidence, 1, '°')} warn={m.incidence > 45} />
      <Readout label="Keystone H (right vs left)" value={fmt(m.keystoneH, 1, ' %')} warn={Math.abs(m.keystoneH) > 25} />
      <Readout label="Keystone V (top vs bottom)" value={fmt(m.keystoneV, 1, ' %')} warn={Math.abs(m.keystoneV) > 25} />
      <Readout label="Beam footprint" value={`${fmt(m.footprintW, 2)} × ${fmt(m.footprintH, 2)} m`} />
      <Readout label="Throw ratio" value={fmt(m.throwRatio, 2, ' : 1')} />
      {!m.hitsWall && <p className="text-[11px] text-amber-300">⚠ Part of the beam misses the wall plane.</p>}
    </div>
  );
}

export function Inspector() {
  const gobo = useStore((s) => s.gobos.find((g) => g.id === s.selectedId));
  const palette = useStore((s) => s.artwork.palette);
  const dragMode = useStore((s) => s.view.dragMode);
  const room = useStore((s) => s.room);
  const artAspect = useStore((s) => s.artwork.aspect);
  const artScale = useStore((s) => s.artwork.scale);
  const { updateGobo, removeGobo, duplicateGobo, bake, fitBeam, setView } = useStore.getState();

  if (!gobo) {
    return (
      <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-500">
        Select a gobo in the list or click one in the room to edit it.
      </aside>
    );
  }

  const id = gobo.id;
  const set = (patch: Partial<Gobo>) => updateGobo(id, patch);
  const setCal = (patch: Partial<Calibration>) => updateGobo(id, (g) => ({ calibration: { ...g.calibration, ...patch } }));
  const drift = poseDrift(gobo);
  const onGobo = artworkOnGobo(gobo, artworkRect(room, artAspect, artScale), artAspect);

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950">
      <Section
        title="Gobo"
        right={
          <div className="flex gap-1">
            <Button onClick={() => duplicateGobo(id)}>Duplicate</Button>
            <Button variant="danger" onClick={() => removeGobo(id)}>
              Delete
            </Button>
          </div>
        }
      >
        <input
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-sky-500"
          value={gobo.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span>Mask layer</span>
          <select
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 font-mono text-neutral-100"
            value={gobo.layer}
            onChange={(e) => set({ layer: e.target.value })}
          >
            {palette.filter((p) => p.projectable || p.hex === gobo.layer).map((p) => (
              <option key={p.hex} value={p.hex}>
                {p.hex}
              </option>
            ))}
            {!palette.some((p) => p.hex === gobo.layer) && <option value={gobo.layer}>{gobo.layer} (missing)</option>}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span>Light color</span>
          <input
            type="color"
            className="h-6 w-10 cursor-pointer rounded border border-neutral-700 bg-transparent"
            value={gobo.color}
            onChange={(e) => set({ color: normalizeColor(e.target.value)?.hex ?? gobo.color })}
          />
          <span className="font-mono text-neutral-200">{gobo.color}</span>
          {gobo.color !== gobo.layer && (
            <button type="button" className="ml-auto text-sky-400" onClick={() => set({ color: gobo.layer })}>
              match layer
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <Toggle label={gobo.visible ? 'Visible' : 'Hidden'} checked={gobo.visible} onChange={(visible) => set({ visible })} />
          <Button onClick={() => setView({ mode: 'gobo' })}>Look through</Button>
        </div>
      </Section>

      <Section
        title="Position (from wall center)"
        right={
          <div className="flex gap-1">
            <Toggle label="Drag body" checked={dragMode === 'body'} onChange={() => setView({ dragMode: 'body', mode: 'room' })} />
            <Toggle label="Drag aim" checked={dragMode === 'target'} onChange={() => setView({ dragMode: 'target', mode: 'room' })} />
          </div>
        }
      >
        <div className="flex gap-2">
          {(['x', 'y', 'z'] as const).map((k) => (
            <NumberField
              key={k}
              label={k}
              value={gobo.position[k]}
              min={k === 'z' ? 0.05 : undefined}
              onChange={(v) => set({ position: { ...gobo.position, [k]: v } })}
            />
          ))}
        </div>
        <div className="text-[11px] text-neutral-500">Aim point on wall (m)</div>
        <div className="flex gap-2">
          {(['x', 'y'] as const).map((k) => (
            <NumberField key={k} label={k} value={gobo.target[k]} onChange={(v) => set({ target: { ...gobo.target, [k]: v } })} />
          ))}
          <Button onClick={() => set({ target: { x: 0, y: 0 } })}>Center</Button>
        </div>
      </Section>

      <Section title="Optics">
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="shrink-0">Gobo diameter</span>
          <NumberField label="Ø" value={gobo.diameterMm} min={10} max={300} step={1} precision={1} unit="mm" onChange={(diameterMm) => set({ diameterMm })} />
        </div>
        <Slider label="Beam angle (zoom)" value={gobo.fov} min={1} max={70} step={0.1} unit="°" precision={1} onChange={(fov) => set({ fov })} />
        <Slider label="Roll" value={gobo.roll} min={-180} max={180} step={0.5} unit="°" precision={1} onChange={(roll) => set({ roll })} />
        <Slider label="Intensity" value={gobo.intensity} min={0} max={3} onChange={(intensity) => set({ intensity })} />
        {(gobo.fov > TYPICAL_BEAM_MAX_DEG || gobo.fov < TYPICAL_BEAM_MIN_DEG) && (
          <p className="text-[11px] text-amber-300">
            ⚠ Outside the typical {TYPICAL_BEAM_MIN_DEG}–{TYPICAL_BEAM_MAX_DEG}° range of gobo projector lenses.
            {gobo.fov > TYPICAL_BEAM_MAX_DEG && ' Move the gobo farther from the wall or shrink the artwork.'}
          </p>
        )}
        <Button onClick={() => fitBeam(id)}>Fit beam to artwork</Button>
      </Section>

      <Section title="Keystone pre-correction">
        <div className="flex flex-wrap gap-1">
          <Toggle
            label="Pre-correct slide"
            checked={gobo.correction.enabled}
            onChange={(enabled) =>
              updateGobo(id, (g) => ({ correction: { ...g.correction, enabled, pose: g.correction.pose ?? poseOf(g) } }))
            }
          />
          <Toggle
            label="Live"
            title="Re-bake continuously while moving (ideal, distortion-free); off = slide stays fixed like a real etched gobo"
            checked={gobo.correction.live}
            onChange={(live) => updateGobo(id, (g) => ({ correction: { ...g.correction, live, pose: live ? poseOf(g) : g.correction.pose } }))}
          />
          <Button onClick={() => bake(id)}>Bake at current pose</Button>
        </div>
        <p className="text-[11px] text-neutral-500">
          {!gobo.correction.enabled
            ? 'Raw mask: the artwork is projected undistorted from the slide, so off-axis gobos show keystone.'
            : drift
              ? '⚠ Gobo moved since the slide was baked; the wall shows the resulting distortion.'
              : 'Slide is pre-distorted for the current pose: the wall image is geometrically exact.'}
        </p>
      </Section>

      <Section
        title="Calibration"
        right={<Button onClick={() => set({ calibration: structuredClone(DEFAULT_CALIBRATION) })}>Reset</Button>}
      >
        <Slider label="Warp X (horizontal keystone)" value={gobo.calibration.warp.x} min={-0.5} max={0.5} step={0.005} precision={3} onChange={(x) => setCal({ warp: { ...gobo.calibration.warp, x } })} />
        <Slider label="Warp Y (vertical keystone)" value={gobo.calibration.warp.y} min={-0.5} max={0.5} step={0.005} precision={3} onChange={(y) => setCal({ warp: { ...gobo.calibration.warp, y } })} />
        <Slider label="Offset X" value={gobo.calibration.offset.x} min={-0.5} max={0.5} step={0.002} precision={3} onChange={(x) => setCal({ offset: { ...gobo.calibration.offset, x } })} />
        <Slider label="Offset Y" value={gobo.calibration.offset.y} min={-0.5} max={0.5} step={0.002} precision={3} onChange={(y) => setCal({ offset: { ...gobo.calibration.offset, y } })} />
        <Slider label="Rotation" value={gobo.calibration.rotation} min={-20} max={20} step={0.1} unit="°" precision={1} onChange={(rotation) => setCal({ rotation })} />
        <Slider label="Scale" value={gobo.calibration.scale} min={0.5} max={1.5} step={0.005} precision={3} onChange={(scale) => setCal({ scale })} />
        <Slider label="Edge feather" value={gobo.calibration.feather} min={0} max={0.03} step={0.0005} precision={4} onChange={(feather) => setCal({ feather })} />
      </Section>

      <Section title="Computed geometry">
        <Readout
          label={`Artwork on Ø ${gobo.diameterMm} mm gobo`}
          value={onGobo ? `${fmt(onGobo.widthMm, 1)} × ${fmt(onGobo.heightMm, 1)} mm` : '—'}
          warn={onGobo?.clipped}
        />
        {onGobo?.clipped && (
          <p className="text-[11px] text-amber-300">⚠ Part of the artwork falls outside the round aperture. Widen the beam or re-bake.</p>
        )}
        <Metrics gobo={gobo} />
      </Section>
    </aside>
  );
}
