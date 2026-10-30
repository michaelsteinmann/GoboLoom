import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { SceneController, type WallHover } from '../three/SceneController';
import { useStore } from '../store';

export const sceneRef: { current: SceneController | null } = { current: null };

const useHover = create<{ hover: WallHover | null }>(() => ({ hover: null }));

export function Viewport() {
  const host = useRef<HTMLDivElement>(null);
  const mode = useStore((s) => s.view.mode);
  const inset = useStore((s) => s.view.compositeInset);
  const selectedName = useStore((s) => s.gobos.find((g) => g.id === s.selectedId)?.name);
  const hasArt = useStore((s) => s.artwork.svg !== null);
  const hover = useHover((s) => s.hover);

  useEffect(() => {
    const ctrl = new SceneController(host.current!);
    ctrl.onHover = (h) => useHover.setState({ hover: h });
    sceneRef.current = ctrl;
    if (import.meta.env.DEV) Object.assign(window, { goboLoomScene: ctrl });
    return () => {
      ctrl.dispose();
      sceneRef.current = null;
    };
  }, []);

  const label =
    mode === 'room'
      ? 'Room camera · drag to orbit, right-drag to pan, scroll to zoom'
      : mode === 'wall'
        ? 'Wall composite · front orthographic view of the projection surface'
        : `Gobo POV · looking through ${selectedName ?? '(select a gobo)'}`;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs text-neutral-300">
        {label}
      </div>
      {inset && mode !== 'wall' && (
        <div className="pointer-events-none absolute bottom-3 right-3 w-[min(32%,420px)]">
          <div className="absolute bottom-full right-0 mb-1 rounded bg-black/60 px-2 py-0.5 text-[11px] text-amber-200">
            Wall composite (projected output)
          </div>
          <div className="aspect-[1/0.62] w-full rounded ring-1 ring-amber-400/50" />
        </div>
      )}
      {hover && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-neutral-300">
          wall x {hover.x.toFixed(3)} m · y {hover.y.toFixed(3)} m · uv ({hover.u.toFixed(3)}, {hover.v.toFixed(3)})
        </div>
      )}
      {!hasArt && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-neutral-400">
          Upload an SVG (or load the sample) to create gobos.
        </div>
      )}
    </div>
  );
}
