import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { assets } from '../three/assets';
import { artworkRect, goboMetrics, poseOf } from '../lib/geometry';
import { artworkOnGobo, drawGoboDisk } from '../lib/slide';
import type { Gobo } from '../types';
import { sceneRef } from './Viewport';

const PREVIEW_PX = 176;
const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');

/** Live round preview of a gobo slide; redraws whenever the slide or light color changes. */
function GoboDisk({ gobo }: { gobo: Gobo }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const slide = useRef<HTMLCanvasElement | null>(null);
  const color = useRef(gobo.color);
  color.current = gobo.color;

  useEffect(() => {
    const ctrl = sceneRef.current;
    if (!ctrl) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    return ctrl.watchSlide(gobo.id, Math.round(PREVIEW_PX * dpr), (c) => {
      slide.current = c;
      if (canvas.current) drawGoboDisk(canvas.current, c, color.current);
    });
  }, [gobo.id]);

  useEffect(() => {
    if (canvas.current && slide.current) drawGoboDisk(canvas.current, slide.current, gobo.color);
  }, [gobo.color]);

  const dpr = Math.min(window.devicePixelRatio, 2);
  return (
    <canvas
      ref={canvas}
      width={Math.round(PREVIEW_PX * dpr)}
      height={Math.round(PREVIEW_PX * dpr)}
      style={{ width: PREVIEW_PX, height: PREVIEW_PX }}
      title="Gobo slide as seen from the lamp, looking toward the wall"
    />
  );
}

function SourceMask({ layer }: { layer: string }) {
  const assetsVersion = useStore((s) => s.assetsVersion);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const mask = assets.maskCanvases.get(layer);
    if (!mask) return setUrl(null);
    const c = document.createElement('canvas');
    const k = 120 / Math.max(mask.width, mask.height);
    c.width = Math.round(mask.width * k);
    c.height = Math.round(mask.height * k);
    c.getContext('2d')!.drawImage(mask, 0, 0, c.width, c.height);
    setUrl(c.toDataURL());
  }, [layer, assetsVersion]);
  return (
    <figure className="mt-1">
      <div className="flex h-16 items-center justify-center bg-black">
        {url && <img src={url} alt="source mask" className="max-h-full max-w-full" />}
      </div>
      <figcaption className="text-center text-neutral-500">source mask (undistorted)</figcaption>
    </figure>
  );
}

function status(g: Gobo): [string, string] {
  if (!g.correction.enabled || !g.correction.pose) return ['raw', 'bg-neutral-700 text-neutral-300'];
  if (g.correction.live) return ['live', 'bg-sky-700/60 text-sky-100'];
  return JSON.stringify(poseOf(g)) === JSON.stringify(g.correction.pose)
    ? ['baked', 'bg-emerald-700/50 text-emerald-200']
    : ['moved', 'bg-amber-600/50 text-amber-100'];
}

function Card({ gobo, selected, diagnostic }: { gobo: Gobo; selected: boolean; diagnostic: boolean }) {
  const room = useStore((s) => s.room);
  const artAspect = useStore((s) => s.artwork.aspect);
  const artScale = useStore((s) => s.artwork.scale);
  const art = artworkRect(room, artAspect, artScale);
  const onGobo = artworkOnGobo(gobo, art, artAspect);
  const [label, chip] = status(gobo);
  const m = diagnostic ? goboMetrics(poseOf(gobo)) : null;

  return (
    <div
      onClick={() => useStore.getState().select(gobo.id)}
      className={`w-[196px] shrink-0 cursor-pointer rounded bg-neutral-900/95 p-2 text-[11px] ring-1 ${
        selected ? 'ring-sky-500' : 'ring-neutral-800'
      } ${gobo.visible ? '' : 'opacity-50'}`}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: gobo.color }} />
        <span className="truncate font-medium text-neutral-100">{gobo.name}</span>
        <span className={`ml-auto rounded px-1.5 ${chip}`}>{label}</span>
      </div>
      <div className="flex justify-center">
        <GoboDisk gobo={gobo} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-neutral-400">
        <span>Ø {fmt(gobo.diameterMm, 0)} mm</span>
        {onGobo && (
          <span title="Artwork size on the gobo">
            {fmt(onGobo.widthMm)} × {fmt(onGobo.heightMm)} mm
          </span>
        )}
      </div>
      {onGobo?.clipped && <div className="text-amber-300">⚠ artwork clipped by the round aperture</div>}
      {m && (
        <>
          <SourceMask layer={gobo.layer} />
          <div className="mt-1 grid grid-cols-2 gap-x-2 font-mono text-neutral-300">
            <span>H {fmt(m.horizontalAngle)}°</span>
            <span>V {fmt(m.verticalAngle)}°</span>
            <span>KH {fmt(m.keystoneH)}%</span>
            <span>KV {fmt(m.keystoneV)}%</span>
            <span>d {fmt(m.distance, 2)} m</span>
            <span>TR {fmt(m.throwRatio, 2)}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function GoboStrip() {
  const gobos = useStore((s) => s.gobos);
  const selectedId = useStore((s) => s.selectedId);
  const diagnostic = useStore((s) => s.view.diagnostic);
  if (!gobos.length) return null;
  return (
    <div className="flex items-start gap-2 overflow-x-auto border-t border-neutral-800 bg-neutral-950 p-2">
      {gobos.map((g) => (
        <Card key={g.id} gobo={g} selected={g.id === selectedId} diagnostic={diagnostic} />
      ))}
    </div>
  );
}
