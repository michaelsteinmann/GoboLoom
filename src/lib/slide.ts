import type { Gobo } from '../types';
import { artworkOnSlide, type Rect } from './geometry';

/**
 * Physical size of the artwork on the gobo (mm) and whether the round aperture clips it.
 * Pre-corrected slides use the baked pose; raw slides fit the artwork's diagonal to the aperture.
 */
export function artworkOnGobo(g: Gobo, art: Rect, artAspect: number) {
  const radiusMm = g.diameterMm / 2;
  const s = g.calibration.scale;
  if (g.correction.enabled && g.correction.pose) {
    const r = artworkOnSlide(g.correction.pose, art);
    if (!r) return null;
    return { widthMm: r.width * radiusMm * s, heightMm: r.height * radiusMm * s, clipped: r.clipped || s > 1 };
  }
  const diag = Math.hypot(artAspect, 1);
  return { widthMm: (2 * artAspect * radiusMm * s) / diag, heightMm: (2 * radiusMm * s) / diag, clipped: s > 1 };
}

/** Draw a slide as a physical gobo disk: steel where it blocks light, light color where it passes. */
export function drawGoboDisk(out: HTMLCanvasElement, slide: HTMLCanvasElement, color: string) {
  const s = out.width;
  const ctx = out.getContext('2d')!;
  ctx.clearRect(0, 0, s, s);

  const tint = document.createElement('canvas');
  tint.width = tint.height = s;
  const tc = tint.getContext('2d')!;
  tc.drawImage(slide, 0, 0, s, s);
  tc.globalCompositeOperation = 'multiply';
  tc.fillStyle = color;
  tc.fillRect(0, 0, s, s);

  const c = s / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c - 1, 0, Math.PI * 2);
  ctx.clip();
  const steel = ctx.createRadialGradient(c * 0.7, c * 0.6, 0, c, c, c);
  steel.addColorStop(0, '#4a4e57');
  steel.addColorStop(1, '#25272c');
  ctx.fillStyle = steel;
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'lighten';
  ctx.drawImage(tint, 0, 0);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(c, c, c - 1, 0, Math.PI * 2);
  ctx.strokeStyle = '#8a8f99';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
