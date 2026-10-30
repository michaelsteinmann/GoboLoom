import { create } from 'zustand';
import type { Artwork, Gobo, OverlapMode, Room, ViewSettings } from './types';
import { DEFAULT_ARTWORK_SCALE, DEFAULT_ROOM, DEFAULT_VIEW, makeGobo, newId } from './lib/defaults';
import { artworkRect, fitFov, poseOf, type Rect } from './lib/geometry';
import { analyzeSvg, rasterizeMasks, rasterizeReference, type AnalyzedSvg } from './lib/svg';
import { parseProject, serializeProject } from './lib/project';
import { setAssets } from './three/assets';

const EMPTY_ARTWORK: Artwork = { svg: null, fileName: null, aspect: 16 / 9, scale: DEFAULT_ARTWORK_SCALE, blend: 'occlude', palette: [], warnings: [] };

interface Status {
  kind: 'idle' | 'busy' | 'error' | 'info';
  message: string;
}

interface State {
  room: Room;
  artwork: Artwork;
  gobos: Gobo[];
  view: ViewSettings;
  selectedId: string | null;
  assetsVersion: number;
  status: Status;

  setRoom: (patch: Partial<Room>) => void;
  setArtworkScale: (scale: number) => void;
  setOverlapMode: (blend: OverlapMode) => Promise<void>;
  setView: (patch: Partial<ViewSettings>) => void;
  setStatus: (status: Status) => void;
  select: (id: string | null) => void;
  updateGobo: (id: string, patch: Partial<Gobo> | ((g: Gobo) => Partial<Gobo>)) => void;
  addGobo: (layer: string) => void;
  duplicateGobo: (id: string) => void;
  removeGobo: (id: string) => void;
  bake: (id: string) => void;
  bakeAll: () => void;
  fitBeam: (id: string) => void;
  loadSvg: (text: string, fileName: string) => Promise<void>;
  loadProject: (text: string) => Promise<void>;
  exportProject: () => string;
}

export const selectArtRect = (s: Pick<State, 'room' | 'artwork'>): Rect =>
  artworkRect(s.room, s.artwork.aspect, s.artwork.scale);

/** The current SVG analysis, kept so masks can be rebuilt when the overlap mode changes. */
let analyzed: AnalyzedSvg | null = null;

async function buildAssets(a: AnalyzedSvg, blend: OverlapMode) {
  const colors = a.palette.filter((p) => p.projectable).map((p) => p.hex);
  const [masks, reference] = await Promise.all([rasterizeMasks(a, colors, blend), rasterizeReference(a)]);
  setAssets(masks, reference);
  analyzed = a;
}

export const useStore = create<State>()((set, get) => ({
  room: DEFAULT_ROOM,
  artwork: EMPTY_ARTWORK,
  gobos: [],
  view: DEFAULT_VIEW,
  selectedId: null,
  assetsVersion: 0,
  status: { kind: 'idle', message: '' },

  setRoom: (patch) => set((s) => ({ room: { ...s.room, ...patch } })),
  setArtworkScale: (scale) => set((s) => ({ artwork: { ...s.artwork, scale } })),
  setOverlapMode: async (blend) => {
    if (analyzed) await buildAssets(analyzed, blend);
    set((s) => ({ artwork: { ...s.artwork, blend }, assetsVersion: s.assetsVersion + 1 }));
  },
  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  setStatus: (status) => set({ status }),
  select: (selectedId) => set({ selectedId }),

  updateGobo: (id, patch) =>
    set((s) => ({
      gobos: s.gobos.map((g) => {
        if (g.id !== id) return g;
        const next = { ...g, ...(typeof patch === 'function' ? patch(g) : patch) };
        if (next.correction.enabled && next.correction.live)
          next.correction = { ...next.correction, pose: poseOf(next) };
        return next;
      }),
    })),

  addGobo: (layer) => {
    const s = get();
    const g = makeGobo(layer, s.gobos.length, s.gobos.length + 1, s.room, selectArtRect(s));
    g.name = `Gobo ${s.gobos.length + 1}`;
    g.position.x = 0;
    g.fov = Math.round(fitFov(poseOf(g), selectArtRect(s)) * 10) / 10;
    g.correction.pose = poseOf(g);
    set({ gobos: [...s.gobos, g], selectedId: g.id });
  },

  duplicateGobo: (id) => {
    const src = get().gobos.find((g) => g.id === id);
    if (!src) return;
    const g: Gobo = { ...structuredClone(src), id: newId(), name: `${src.name} copy` };
    g.position.x += 0.3;
    set((s) => ({ gobos: [...s.gobos, g], selectedId: g.id }));
  },

  removeGobo: (id) =>
    set((s) => ({
      gobos: s.gobos.filter((g) => g.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      view: s.view.soloId === id ? { ...s.view, soloId: null } : s.view,
    })),

  bake: (id) => get().updateGobo(id, (g) => ({ correction: { ...g.correction, enabled: true, pose: poseOf(g) } })),
  bakeAll: () => get().gobos.forEach((g) => get().bake(g.id)),
  fitBeam: (id) => {
    const rect = selectArtRect(get());
    get().updateGobo(id, (g) => ({ fov: Math.round(fitFov(poseOf(g), rect) * 10) / 10 }));
  },

  loadSvg: async (text, fileName) => {
    set({ status: { kind: 'busy', message: 'Separating colors…' } });
    try {
      const a = analyzeSvg(text);
      const blend: OverlapMode = a.additiveHint ? 'additive' : 'occlude';
      await buildAssets(a, blend);
      const s = get();
      const artwork: Artwork = {
        svg: a.svg,
        fileName,
        aspect: a.aspect,
        scale: s.artwork.scale,
        blend,
        palette: a.palette,
        warnings: a.warnings,
      };
      const rect = artworkRect(s.room, artwork.aspect, artwork.scale);
      const layers = a.palette.filter((p) => p.projectable);
      const gobos = layers.map((p, i) => makeGobo(p.hex, i, layers.length, s.room, rect));
      set((st) => ({
        artwork,
        gobos,
        selectedId: gobos[0]?.id ?? null,
        assetsVersion: st.assetsVersion + 1,
        view: { ...st.view, soloId: null },
        status: {
          kind: 'info',
          message: `Found ${layers.length} projectable color${layers.length === 1 ? '' : 's'} → ${gobos.length} gobo${gobos.length === 1 ? '' : 's'}.`,
        },
      }));
    } catch (e) {
      set({ status: { kind: 'error', message: (e as Error).message } });
    }
  },

  loadProject: async (text) => {
    set({ status: { kind: 'busy', message: 'Loading project…' } });
    try {
      const p = parseProject(text);
      let artwork: Artwork = { ...EMPTY_ARTWORK, scale: p.scale, blend: p.blend };
      if (p.svg) {
        const a = analyzeSvg(p.svg);
        await buildAssets(a, p.blend);
        artwork = { ...artwork, svg: a.svg, fileName: p.fileName, aspect: a.aspect, palette: a.palette, warnings: a.warnings };
      } else {
        setAssets(new Map(), null);
        analyzed = null;
      }
      set((st) => ({
        room: p.room,
        artwork,
        gobos: p.gobos,
        view: { ...DEFAULT_VIEW, ...p.view },
        selectedId: p.gobos[0]?.id ?? null,
        assetsVersion: st.assetsVersion + 1,
        status: { kind: 'info', message: `Loaded project with ${p.gobos.length} gobos.` },
      }));
    } catch (e) {
      set({ status: { kind: 'error', message: (e as Error).message } });
    }
  },

  exportProject: () => {
    const s = get();
    return JSON.stringify(
      serializeProject({
        room: s.room,
        svg: s.artwork.svg,
        fileName: s.artwork.fileName,
        scale: s.artwork.scale,
        blend: s.artwork.blend,
        gobos: s.gobos,
        view: s.view,
      }),
      null,
      2,
    );
  },
}));
