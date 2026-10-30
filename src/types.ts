// Plain, serializable data model. Three.js objects (textures, cameras) are
// derived from this state and never stored in it, so projects round-trip as JSON.
//
// Coordinate frame ("surface frame"), used everywhere including the 3D scene:
//   origin = center of the projection wall
//   +x     = right along the wall, +y = up, +z = away from the wall into the room
// The wall itself is the plane z = 0.

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface Room {
  width: number; // east-west extent (m)
  depth: number; // north-south extent (m)
  height: number;
  projectionWall: WallSide;
}

export interface ProjectionSurface {
  width: number;
  height: number;
  center: Vec3; // always the origin of the surface frame
  normal: Vec3; // always +z
}

/**
 * How overlapping shapes of different colors become masks:
 * occlude  = the top shape hides what is beneath (masks partition the artwork)
 * additive = every color keeps its full shapes, so overlapping light mixes on the wall
 */
export type OverlapMode = 'occlude' | 'additive';

export interface PaletteEntry {
  hex: string; // normalized #rrggbb
  shapeCount: number;
  projectable: boolean; // black cannot be produced by additive light
}

export interface Artwork {
  svg: string | null;
  fileName: string | null;
  aspect: number; // width / height of the SVG viewBox
  scale: number; // fraction of the wall the artwork may occupy (contain-fit)
  blend: OverlapMode;
  palette: PaletteEntry[];
  warnings: string[];
}

/** Optical pose a gobo slide was pre-distorted ("baked") for. */
export interface GoboPose {
  position: Vec3;
  target: Vec2;
  fov: number;
  roll: number;
}

export interface Calibration {
  warp: Vec2; // extra keystone: x = horizontal, y = vertical (-1..1)
  offset: Vec2; // slide-space shift (-1..1 of half-slide)
  rotation: number; // degrees, rotates the slide image
  scale: number;
  feather: number; // edge softness, fraction of slide width
}

export interface Gobo {
  id: string;
  name: string;
  layer: string; // palette hex whose shapes form this gobo's mask
  color: string; // projected light color (#rrggbb), initially = layer
  position: Vec3; // relative to projection-surface center
  target: Vec2; // aim point on the wall (z = 0)
  fov: number; // full beam (cone) angle, degrees; the aperture is always round
  diameterMm: number; // usable image-area diameter (default 64 mm)
  roll: number; // rotation about the optical axis, degrees
  intensity: number;
  visible: boolean;
  calibration: Calibration;
  correction: {
    enabled: boolean; // pre-distort the slide to cancel keystone
    live: boolean; // re-bake continuously as the gobo moves
    pose: GoboPose | null; // pose used when baking
  };
}

export type ViewMode = 'room' | 'wall' | 'gobo';
export type DragMode = 'body' | 'target';

export interface ViewSettings {
  mode: ViewMode;
  dragMode: DragMode;
  wireframe: boolean;
  beams: boolean;
  icons: boolean;
  grid: boolean;
  compositeInset: boolean;
  reference: boolean;
  referenceOpacity: number;
  diagnostic: boolean;
  previews: boolean; // live gobo slide previews
  physicalFalloff: boolean;
  ambient: number;
  soloId: string | null;
}

export interface GoboLoomProject {
  format: 'gobo-loom';
  version: 1;
  room: Room;
  surface: ProjectionSurface;
  artwork: { svg: string | null; fileName: string | null; scale: number; blend: OverlapMode };
  gobos: Gobo[];
  view: Partial<ViewSettings>;
}
