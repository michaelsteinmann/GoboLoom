import type { Gobo, GoboLoomProject, OverlapMode, Room, ViewSettings, WallSide } from '../types';
import { DEFAULT_ARTWORK_SCALE, DEFAULT_CALIBRATION, DEFAULT_GOBO_DIAMETER_MM, DEFAULT_ROOM, DEFAULT_VIEW } from './defaults';
import { surfaceOf } from './geometry';
import { parseColorLiteral } from './color';

export class ProjectError extends Error {}

export function serializeProject(p: {
  room: Room;
  svg: string | null;
  fileName: string | null;
  scale: number;
  blend: OverlapMode;
  gobos: Gobo[];
  view: ViewSettings;
}): GoboLoomProject {
  const { mode, dragMode, soloId, ...view } = p.view;
  void mode, dragMode, soloId; // transient UI state is not saved
  return {
    format: 'gobo-loom',
    version: 1,
    room: p.room,
    surface: surfaceOf(p.room),
    artwork: { svg: p.svg, fileName: p.fileName, scale: p.scale, blend: p.blend },
    gobos: p.gobos,
    view,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const vec = <T extends object>(v: unknown, fallback: T): T => {
  const out: Record<string, number> = { ...(fallback as Record<string, number>) };
  if (isObj(v)) for (const k of Object.keys(out)) out[k] = num(v[k], out[k]);
  return out as T;
};
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && parseColorLiteral(v)?.hex) || fallback;

function parseGobo(raw: unknown, i: number): Gobo {
  if (!isObj(raw)) throw new ProjectError(`Gobo ${i + 1} is malformed.`);
  const layer = hex(raw.layer, '');
  if (!layer) throw new ProjectError(`Gobo ${i + 1} has no valid color layer.`);
  const cal = isObj(raw.calibration) ? raw.calibration : {};
  const corr = isObj(raw.correction) ? raw.correction : {};
  const position = vec(raw.position, { x: 0, y: 0, z: 3 });
  const target = vec(raw.target, { x: 0, y: 0 });
  const fov = num(raw.fov, 30, 1, 170);
  const roll = num(raw.roll, 0);
  const pose = isObj(corr.pose)
    ? {
        position: vec(corr.pose.position, position),
        target: vec(corr.pose.target, target),
        fov: num(corr.pose.fov, fov, 1, 170),
        roll: num(corr.pose.roll, roll),
      }
    : null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `gobo-loaded-${i}`,
    name: typeof raw.name === 'string' ? raw.name : `Gobo ${i + 1}`,
    layer,
    color: hex(raw.color, layer),
    position,
    target,
    fov,
    diameterMm: num(raw.diameterMm, DEFAULT_GOBO_DIAMETER_MM, 10, 300),
    roll,
    intensity: num(raw.intensity, 1, 0, 4),
    visible: raw.visible !== false,
    calibration: {
      warp: vec(cal.warp, DEFAULT_CALIBRATION.warp),
      offset: vec(cal.offset, DEFAULT_CALIBRATION.offset),
      rotation: num(cal.rotation, 0),
      scale: num(cal.scale, 1, 0.05, 10),
      feather: num(cal.feather, 0, 0, 0.1),
    },
    correction: { enabled: corr.enabled !== false && pose !== null, live: corr.live === true, pose },
  };
}

export function parseProject(text: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError('The project file is not valid JSON.');
  }
  if (!isObj(raw) || raw.format !== 'gobo-loom') throw new ProjectError('This is not a GoboLoom project file.');
  if (raw.version !== 1) throw new ProjectError(`Unsupported project version ${String(raw.version)}.`);

  const r = isObj(raw.room) ? raw.room : {};
  const walls: WallSide[] = ['north', 'south', 'east', 'west'];
  const room: Room = {
    width: num(r.width, DEFAULT_ROOM.width, 1, 100),
    depth: num(r.depth, DEFAULT_ROOM.depth, 1, 100),
    height: num(r.height, DEFAULT_ROOM.height, 1, 50),
    projectionWall: walls.includes(r.projectionWall as WallSide) ? (r.projectionWall as WallSide) : 'north',
  };
  const art = isObj(raw.artwork) ? raw.artwork : {};
  const gobos = Array.isArray(raw.gobos) ? raw.gobos.map(parseGobo) : [];
  const v = isObj(raw.view) ? raw.view : {};
  const view: Partial<ViewSettings> = {};
  for (const [k, def] of Object.entries(DEFAULT_VIEW)) {
    if (typeof v[k] === typeof def && def !== null) (view as Record<string, unknown>)[k] = v[k];
  }
  return {
    room,
    svg: typeof art.svg === 'string' ? art.svg : null,
    fileName: typeof art.fileName === 'string' ? art.fileName : null,
    scale: num(art.scale, DEFAULT_ARTWORK_SCALE, 0.05, 1),
    blend: (art.blend === 'additive' ? 'additive' : 'occlude') as OverlapMode,
    gobos,
    view,
  };
}
