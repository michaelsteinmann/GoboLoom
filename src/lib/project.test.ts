import { parseProject, serializeProject } from './project';
import { DEFAULT_ARTWORK_SCALE, DEFAULT_ROOM, DEFAULT_VIEW, TYPICAL_BEAM_MAX_DEG, makeGobo } from './defaults';
import { artworkRect, goboMetrics, poseOf } from './geometry';

const art = artworkRect(DEFAULT_ROOM, 16 / 9, 0.6);

describe('project files', () => {
  it('round-trips room, artwork, gobos and calibration', () => {
    const gobos = ['#ff0000', '#0000ff'].map((c, i) => makeGobo(c, i, 2, DEFAULT_ROOM, art));
    gobos[1].calibration.warp = { x: 0.1, y: -0.05 };
    gobos[1].name = 'Blue "left"';
    const json = JSON.stringify(
      serializeProject({ room: DEFAULT_ROOM, svg: '<svg/>', fileName: 'a.svg', scale: 0.6, blend: 'additive', gobos, view: { ...DEFAULT_VIEW, soloId: 'x' } }),
    );
    const p = parseProject(json);
    expect(p.room).toEqual(DEFAULT_ROOM);
    expect(p.svg).toBe('<svg/>');
    expect(p.blend).toBe('additive');
    expect(p.gobos).toEqual(gobos);
    expect(p.view.soloId).toBeUndefined(); // transient state not saved
  });

  it('rejects foreign or malformed files', () => {
    expect(() => parseProject('not json')).toThrow(/valid JSON/);
    expect(() => parseProject('{"format":"other"}')).toThrow(/not a GoboLoom/);
    expect(() => parseProject('{"format":"gobo-loom","version":1,"gobos":[{"layer":"bogus"}]}')).toThrow(/color layer/);
  });

  it('clamps out-of-range numbers', () => {
    const p = parseProject('{"format":"gobo-loom","version":1,"room":{"width":-5},"gobos":[{"layer":"#f00","fov":999}]}');
    expect(p.room.width).toBe(1);
    expect(p.blend).toBe('occlude'); // default for older files
    expect(p.gobos[0].fov).toBe(170);
    expect(p.gobos[0].correction.enabled).toBe(false); // no baked pose saved
  });
});

describe('default gobos', () => {
  it('use a realistic narrow beam angle for the default room and artwork size', () => {
    const rect = artworkRect(DEFAULT_ROOM, 16 / 9, DEFAULT_ARTWORK_SCALE);
    const gobos = ['#ff0000', '#ffd200', '#0000ff'].map((c, i) => makeGobo(c, i, 3, DEFAULT_ROOM, rect));
    for (const g of gobos) expect(g.fov).toBeLessThanOrEqual(TYPICAL_BEAM_MAX_DEG);
  });

  it('spread across the room, aimed at the wall center, beam covering the artwork, pre-corrected', () => {
    const gobos = ['#ff0000', '#ffd200', '#0000ff'].map((c, i) => makeGobo(c, i, 3, DEFAULT_ROOM, art));
    expect(new Set(gobos.map((g) => g.position.x)).size).toBe(3);
    for (const g of gobos) {
      expect(g.correction.pose).toEqual(poseOf(g));
      const m = goboMetrics(poseOf(g));
      expect(m.hitsWall).toBe(true);
      expect(m.footprintH).toBeGreaterThan(art.h);
    }
  });
});
