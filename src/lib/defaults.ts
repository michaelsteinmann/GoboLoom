import type { Calibration, Gobo, Room, ViewSettings } from '../types';
import { fitFov, poseOf, surfaceDims, type Rect } from './geometry';

export const DEFAULT_ROOM: Room = { width: 8, depth: 6, height: 3.5, projectionWall: 'north' };

export const DEFAULT_VIEW: ViewSettings = {
  mode: 'room',
  dragMode: 'body',
  wireframe: false,
  beams: true,
  icons: true,
  grid: false,
  compositeInset: false,
  reference: false,
  referenceOpacity: 0.35,
  diagnostic: false,
  previews: true,
  physicalFalloff: false,
  ambient: 0.12,
  soloId: null,
};

export const DEFAULT_CALIBRATION: Calibration = {
  warp: { x: 0, y: 0 },
  offset: { x: 0, y: 0 },
  rotation: 0,
  scale: 1,
  feather: 0,
};

/** Default fraction of the wall the artwork may occupy. */
export const DEFAULT_ARTWORK_SCALE = 0.4;

/** Typical zoom range of gobo projector lenses; wider beams get a warning. */
export const TYPICAL_BEAM_MIN_DEG = 10;
export const TYPICAL_BEAM_MAX_DEG = 40;

/** Usable image area of a standard B-size (86 mm) gobo. */
export const DEFAULT_GOBO_DIAMETER_MM = 64;

const round = (n: number) => Math.round(n * 100) / 100;

let counter = 0;
export const newId = () => `gobo-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * A gobo for one color layer, rigged near the ceiling at the back of the room (long throw,
 * narrow beam) and spread sideways so the defaults show visible keystone; its slide is
 * pre-corrected for that pose.
 */
export function makeGobo(layer: string, index: number, count: number, room: Room, art: Rect): Gobo {
  const dims = surfaceDims(room);
  const spread = Math.min(1.5, dims.width * 0.3);
  const x = count > 1 ? -spread + (2 * spread * index) / (count - 1) : 0;
  const gobo: Gobo = {
    id: newId(),
    name: `Gobo ${index + 1}`,
    layer,
    color: layer,
    position: { x: round(x), y: round(dims.height / 2 - 0.35), z: round(Math.max(dims.depth - 0.5, dims.depth * 0.8)) },
    target: { x: 0, y: 0 },
    fov: 30,
    diameterMm: DEFAULT_GOBO_DIAMETER_MM,
    roll: 0,
    intensity: 1,
    visible: true,
    calibration: structuredClone(DEFAULT_CALIBRATION),
    correction: { enabled: true, live: false, pose: null },
  };
  gobo.fov = Math.round(fitFov(poseOf(gobo), art) * 10) / 10;
  gobo.correction.pose = poseOf(gobo);
  return gobo;
}
