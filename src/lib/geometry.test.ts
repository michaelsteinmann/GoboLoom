import { Vector3 } from 'three';
import { artworkOnSlide, artworkRect, fitFov, goboMetrics, ndcToWall, poseCamera, surfaceDims } from './geometry';
import type { GoboPose, Room } from '../types';

const room: Room = { width: 8, depth: 6, height: 3.5, projectionWall: 'north' };
const pose = (x: number, y: number, z: number, extra: Partial<GoboPose> = {}): GoboPose => ({
  position: { x, y, z },
  target: { x: 0, y: 0 },
  fov: 30,
  roll: 0,
  ...extra,
});

describe('surface', () => {
  it('uses the room width for north/south walls and depth for east/west', () => {
    expect(surfaceDims(room)).toEqual({ width: 8, height: 3.5, depth: 6 });
    expect(surfaceDims({ ...room, projectionWall: 'east' })).toEqual({ width: 6, height: 3.5, depth: 8 });
  });

  it('contain-fits the artwork into the scaled wall, centered', () => {
    const wide = artworkRect(room, 3, 0.5); // box 4 × 1.75 m, limited by width
    expect(wide.w).toBeCloseTo(4);
    expect(wide.h).toBeCloseTo(4 / 3);
    expect(wide.x0).toBeCloseTo(-2);
    const tall = artworkRect(room, 0.5, 1); // limited by height: 3.5 m
    expect(tall.h).toBeCloseTo(3.5);
    expect(tall.w).toBeCloseTo(1.75);
  });
});

describe('gobo metrics', () => {
  it('reports no distortion for an on-axis gobo', () => {
    const m = goboMetrics(pose(0, 0, 4));
    expect(m.distance).toBeCloseTo(4);
    expect(m.horizontalAngle).toBeCloseTo(0);
    expect(m.verticalAngle).toBeCloseTo(0);
    expect(m.keystoneH).toBeCloseTo(0);
    expect(m.keystoneV).toBeCloseTo(0);
    expect(m.hitsWall).toBe(true);
    // round beam on axis: a circle whose diameter matches the cone angle
    expect(m.footprintH).toBeCloseTo(2 * 4 * Math.tan(Math.PI / 12), 2);
    expect(m.footprintW).toBeCloseTo(m.footprintH, 2);
  });

  it('a gobo above its target widens the bottom of the image (negative vertical keystone)', () => {
    const m = goboMetrics(pose(0, 2, 4));
    expect(m.verticalAngle).toBeCloseTo((Math.atan2(2, 4) * 180) / Math.PI);
    expect(m.keystoneV).toBeLessThan(-5);
    expect(m.keystoneH).toBeCloseTo(0);
  });

  it('a gobo right of its target makes the left edge taller (negative horizontal keystone)', () => {
    const m = goboMetrics(pose(3, 0, 4));
    expect(m.horizontalAngle).toBeGreaterThan(30);
    expect(m.keystoneH).toBeLessThan(-5);
    expect(m.keystoneV).toBeCloseTo(0);
  });

  it('flags beams that miss the wall', () => {
    expect(goboMetrics(pose(0, 0, 4, { fov: 170, position: { x: 0, y: 0, z: 0.5 }, target: { x: 50, y: 0 } })).hitsWall).toBe(false);
  });
});

describe('projector camera', () => {
  it('casting NDC onto the wall and projecting back is the identity', () => {
    const cam = poseCamera(pose(1.2, 1.4, 3.1, { roll: 12, fov: 40 }));
    for (const [x, y] of [[0, 0], [0.7, -0.4], [-0.9, 0.95]]) {
      const w = ndcToWall(cam, x, y)!;
      expect(w.z).toBeCloseTo(0);
      const back = w.clone().project(cam);
      expect(back.x).toBeCloseTo(x);
      expect(back.y).toBeCloseTo(y);
    }
  });

  it('aims the optical axis at the target', () => {
    const cam = poseCamera(pose(-2, 1, 3, { target: { x: 0.5, y: -0.3 } }));
    const hit = ndcToWall(cam, 0, 0)!;
    expect(hit.distanceTo(new Vector3(0.5, -0.3, 0))).toBeLessThan(1e-6);
  });

  it('fitFov makes the beam just cover the artwork', () => {
    const art = artworkRect(room, 16 / 9, 0.6);
    const p = pose(1.5, 1.4, 3.6);
    const fov = fitFov(p, art, 1);
    const cam = poseCamera({ ...p, fov });
    const ndc = [
      [art.x0, art.y0],
      [art.x0 + art.w, art.y0],
      [art.x0 + art.w, art.y0 + art.h],
      [art.x0, art.y0 + art.h],
    ].map(([x, y]) => new Vector3(x, y, 0).project(cam));
    // the farthest artwork corner sits exactly on the round aperture's rim
    const extent = Math.max(...ndc.map((v) => Math.hypot(v.x, v.y)));
    expect(extent).toBeCloseTo(1, 4);
    expect(artworkOnSlide({ ...p, fov }, art)!.clipped).toBe(false);
    expect(artworkOnSlide({ ...p, fov: fov * 0.9 }, art)!.clipped).toBe(true);
  });
});
