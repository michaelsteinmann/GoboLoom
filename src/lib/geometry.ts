import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Gobo, GoboPose, ProjectionSurface, Room, Vec2, Vec3 } from '../types';

export interface Rect {
  x0: number; // left edge on the wall (m)
  y0: number; // bottom edge
  w: number;
  h: number;
}

/** Wall width/height and how far the room extends from it, in the surface frame. */
export function surfaceDims(room: Room) {
  const alongX = room.projectionWall === 'north' || room.projectionWall === 'south';
  return {
    width: alongX ? room.width : room.depth,
    height: room.height,
    depth: alongX ? room.depth : room.width,
  };
}

export function surfaceOf(room: Room): ProjectionSurface {
  const { width, height } = surfaceDims(room);
  return { width, height, center: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
}

/** Artwork rectangle on the wall: SVG aspect contain-fitted into `scale` of the wall. */
export function artworkRect(room: Room, aspect: number, scale: number): Rect {
  const { width, height } = surfaceDims(room);
  const maxW = width * scale;
  const maxH = height * scale;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { x0: -w / 2, y0: -h / 2, w, h };
}

/** Convert a wall point (surface frame) to artwork UV (0..1, y up). */
export function wallToArtUV(p: Vec2, rect: Rect): Vec2 {
  return { x: (p.x - rect.x0) / rect.w, y: (p.y - rect.y0) / rect.h };
}

export function poseOf(gobo: Gobo): GoboPose {
  return {
    position: { ...gobo.position },
    target: { ...gobo.target },
    fov: gobo.fov,
    roll: gobo.roll,
  };
}

const UP = new Vector3(0, 1, 0);
const ALT_UP = new Vector3(0, 0, -1);

/** Build (or update) the virtual projector camera for a pose. */
export function poseCamera(pose: GoboPose, cam = new PerspectiveCamera()): PerspectiveCamera {
  cam.fov = pose.fov;
  cam.aspect = 1; // round aperture: the cone is inscribed in a square frustum
  cam.near = 0.02;
  cam.far = 200;
  cam.position.set(pose.position.x, pose.position.y, pose.position.z);
  const target = new Vector3(pose.target.x, pose.target.y, 0);
  const dir = target.clone().sub(cam.position).normalize();
  cam.up.copy(Math.abs(dir.dot(UP)) > 0.999 ? ALT_UP : UP);
  cam.lookAt(target);
  cam.rotateZ(MathUtils.degToRad(pose.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

/** Where a ray through NDC (x, y) of the camera hits the wall plane z = 0, or null. */
export function ndcToWall(cam: PerspectiveCamera, x: number, y: number): Vector3 | null {
  const p = new Vector3(x, y, 0.5).unproject(cam);
  const dir = p.sub(cam.position);
  if (dir.z >= -1e-9) return null; // parallel to or pointing away from the wall
  const t = -cam.position.z / dir.z;
  if (t <= 0) return null;
  return cam.position.clone().addScaledVector(dir, t);
}

/** NDC point on the edge of the round aperture at `angle` radians. */
export const rimPoint = (angle: number): [number, number] => [Math.cos(angle), Math.sin(angle)];

/** Outline of the round beam on the wall (null where a rim ray misses the wall). */
export function footprint(cam: PerspectiveCamera, segments = 64): (Vector3 | null)[] {
  return Array.from({ length: segments }, (_, i) => ndcToWall(cam, ...rimPoint((i / segments) * Math.PI * 2)));
}

export interface GoboMetrics {
  distance: number; // gobo to aim point
  horizontalAngle: number; // degrees off the wall normal, + = gobo right of target
  verticalAngle: number; // + = gobo above target
  incidence: number; // total angle off the wall normal
  keystoneH: number; // % right-edge height vs left-edge height of a slide square (0 = none)
  keystoneV: number; // % top-edge width vs bottom-edge width
  footprintW: number; // width of the (elliptical) beam footprint on the wall (m)
  footprintH: number;
  throwRatio: number; // distance / footprint width
  hitsWall: boolean; // the whole beam lands on the wall plane
}

export function goboMetrics(pose: GoboPose): GoboMetrics {
  const p = pose.position;
  const d = new Vector3(p.x - pose.target.x, p.y - pose.target.y, p.z);
  const distance = d.length();
  const horizontalAngle = MathUtils.radToDeg(Math.atan2(d.x, d.z));
  const verticalAngle = MathUtils.radToDeg(Math.atan2(d.y, d.z));
  const incidence = distance > 0 ? MathUtils.radToDeg(Math.acos(MathUtils.clamp(d.z / distance, -1, 1))) : 0;

  const cam = poseCamera(pose);
  const fp = footprint(cam);
  const hitsWall = fp.every(Boolean) && p.z > 0;
  let keystoneH = NaN;
  let keystoneV = NaN;
  let footprintW = NaN;
  let footprintH = NaN;
  if (hitsWall) {
    // Keystone of the square inscribed in the aperture (its corners lie on the rim).
    const k = Math.SQRT1_2;
    const [bl, br, tr, tl] = [[-k, -k], [k, -k], [k, k], [-k, k]].map(([x, y]) => ndcToWall(cam, x, y)!);
    keystoneH = (br.distanceTo(tr) / bl.distanceTo(tl) - 1) * 100;
    keystoneV = (tl.distanceTo(tr) / bl.distanceTo(br) - 1) * 100;
    const xs = (fp as Vector3[]).map((v) => v.x);
    const ys = (fp as Vector3[]).map((v) => v.y);
    footprintW = Math.max(...xs) - Math.min(...xs);
    footprintH = Math.max(...ys) - Math.min(...ys);
  }
  return {
    distance,
    horizontalAngle,
    verticalAngle,
    incidence,
    keystoneH,
    keystoneV,
    footprintW,
    footprintH,
    throwRatio: distance / footprintW,
    hitsWall,
  };
}

/** Smallest cone angle (degrees) whose round beam covers the whole rect, with a relative margin. */
export function fitFov(pose: GoboPose, rect: Rect, margin = 1.08): number {
  const cam = poseCamera({ ...pose, fov: 60 });
  const inv = cam.matrixWorldInverse;
  let need = 0;
  for (const [x, y] of [
    [rect.x0, rect.y0],
    [rect.x0 + rect.w, rect.y0],
    [rect.x0 + rect.w, rect.y0 + rect.h],
    [rect.x0, rect.y0 + rect.h],
  ]) {
    const c = new Vector3(x, y, 0).applyMatrix4(inv);
    if (c.z >= 0) return 170; // corner behind the projector; widest possible
    const depth = -c.z;
    need = Math.max(need, Math.hypot(c.x, c.y) / depth);
  }
  return MathUtils.clamp(MathUtils.radToDeg(2 * Math.atan(need * margin)), 1, 170);
}

/**
 * Where the artwork lands on the gobo slide for a pose: bounding box of the artwork corners in
 * slide coordinates (-1..1 across the aperture) and whether any of the artwork falls outside
 * the round aperture (= gets clipped).
 */
export function artworkOnSlide(pose: GoboPose, rect: Rect) {
  const cam = poseCamera(pose);
  const pts: Vector3[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(
      new Vector3(rect.x0 + t * rect.w, rect.y0, 0),
      new Vector3(rect.x0 + t * rect.w, rect.y0 + rect.h, 0),
      new Vector3(rect.x0, rect.y0 + t * rect.h, 0),
      new Vector3(rect.x0 + rect.w, rect.y0 + t * rect.h, 0),
    );
  }
  const inv = cam.matrixWorldInverse;
  if (pts.some((p) => p.clone().applyMatrix4(inv).z >= 0)) return null; // artwork behind projector
  const ndc = pts.map((p) => p.project(cam));
  const xs = ndc.map((v) => v.x);
  const ys = ndc.map((v) => v.y);
  return {
    width: Math.max(...xs) - Math.min(...xs), // in aperture radii
    height: Math.max(...ys) - Math.min(...ys),
    clipped: ndc.some((v) => Math.hypot(v.x, v.y) > 1 + 1e-6),
  };
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}
