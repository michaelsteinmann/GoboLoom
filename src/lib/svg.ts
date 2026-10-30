import { isUnprojectable, normalizeColor } from './color';
import type { OverlapMode, PaletteEntry } from '../types';

export const MAX_SVG_BYTES = 5 * 1024 * 1024;

const SHAPES = 'path, rect, circle, ellipse, polygon, polyline, text';
const NON_RENDERED = 'defs, clipPath, mask, symbol, marker, pattern, linearGradient, radialGradient';

/** Fill marker for gradient/pattern shapes: never lit, but they hide what is beneath them. */
export const OCCLUDER = 'occluder';

export class SvgError extends Error {}

export interface AnalyzedSvg {
  /** Sanitized SVG source (no scripts, event handlers or external references). */
  svg: string;
  viewBox: { x: number; y: number; w: number; h: number };
  aspect: number;
  palette: PaletteEntry[];
  warnings: string[];
  /** Per-shape normalized fill in document order: #rrggbb, OCCLUDER, or null (unpainted). */
  fills: (string | null)[];
  /** The SVG composites shapes additively (mix-blend-mode screen/lighten/plus-lighter). */
  additiveHint: boolean;
}

function sanitize(root: Element) {
  root.querySelectorAll('script, foreignObject').forEach((el) => el.remove());
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#') && !value.startsWith('data:image/'))
        el.removeAttribute(attr.name);
    }
  }
}

/** mix-blend-mode is not inherited, so check the shape and every enclosing group. */
function blendsAdditively(el: Element, root: Element) {
  for (let node: Element | null = el; node && node !== root.parentElement; node = node.parentElement) {
    if (/^(screen|lighten|plus-lighter)$/.test(getComputedStyle(node).mixBlendMode)) return true;
  }
  return false;
}

function isRenderedShape(el: Element) {
  return !el.closest(NON_RENDERED);
}

function parse(text: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.nodeName.toLowerCase() !== 'svg')
    throw new SvgError('The file is not valid SVG markup.');
  sanitize(root);
  return root as unknown as SVGSVGElement;
}

/** Run `fn` with the SVG attached to the live document so computed styles resolve CSS classes. */
function withMounted<T>(root: SVGSVGElement, fn: (mounted: SVGSVGElement) => T): T {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none';
  const mounted = document.importNode(root, true) as SVGSVGElement;
  host.appendChild(mounted);
  document.body.appendChild(host);
  try {
    return fn(mounted);
  } finally {
    host.remove();
  }
}

function readViewBox(svg: SVGSVGElement) {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
  const w = svg.width?.baseVal?.value;
  const h = svg.height?.baseVal?.value;
  if (w > 0 && h > 0) return { x: 0, y: 0, w, h };
  const box = svg.getBBox();
  if (box.width > 0 && box.height > 0) return { x: box.x, y: box.y, w: box.width, h: box.height };
  throw new SvgError('Could not determine the SVG size (no viewBox, width/height, or visible content).');
}

export function analyzeSvg(text: string): AnalyzedSvg {
  if (!text.trim()) throw new SvgError('The file is empty.');
  if (new Blob([text]).size > MAX_SVG_BYTES)
    throw new SvgError(`SVG is larger than ${MAX_SVG_BYTES / 1024 / 1024} MB.`);

  const root = parse(text);
  const warnings = new Set<string>();
  if (root.querySelector('linearGradient, radialGradient')) warnings.add('Gradients are not supported; gradient-filled shapes are treated as unlit.');
  if (root.querySelector('pattern')) warnings.add('Patterns are not supported; pattern-filled shapes are treated as unlit.');
  if (root.querySelector('image')) warnings.add('Embedded images are ignored.');
  if (root.querySelector('filter')) warnings.add('SVG filters are ignored.');
  if (root.querySelector('use')) warnings.add('<use> references are not expanded; reused shapes are ignored.');

  let additiveHint = false;
  const { viewBox, fills } = withMounted(root, (mounted) => {
    const viewBox = readViewBox(mounted);
    const fills = [...mounted.querySelectorAll(SHAPES)].map((el): string | null => {
      if (!isRenderedShape(el)) return null;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      const stroke = cs.stroke;
      if (stroke && stroke !== 'none' && parseFloat(cs.strokeWidth || '1') > 0)
        warnings.add('Strokes are ignored; only filled areas become gobo masks.');
      if (parseFloat(cs.fillOpacity) < 1 || parseFloat(cs.opacity) < 1)
        warnings.add('Transparency is ignored; semi-transparent fills are projected fully opaque.');
      const fill = cs.fill;
      if (!fill || fill === 'none') return null;
      if (!additiveHint && blendsAdditively(el, mounted)) additiveHint = true;
      if (fill.startsWith('url(')) return OCCLUDER;
      const color = normalizeColor(fill);
      if (!color) {
        warnings.add(`Unsupported fill color "${fill}" was skipped.`);
        return null;
      }
      if (color.alpha < 1) warnings.add('Transparency is ignored; semi-transparent fills are projected fully opaque.');
      return color.hex;
    });
    return { viewBox, fills };
  });

  const counts = new Map<string, number>();
  for (const hex of fills) if (hex && hex !== OCCLUDER) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  if (counts.size === 0) throw new SvgError('No solid-color filled shapes were found in this SVG.');

  const palette: PaletteEntry[] = [...counts]
    .map(([hex, shapeCount]) => ({ hex, shapeCount, projectable: !isUnprojectable(hex) }))
    .sort((a, b) => Number(b.projectable) - Number(a.projectable) || b.shapeCount - a.shapeCount);
  if (!palette.some((p) => p.projectable))
    throw new SvgError('The SVG only contains black fills, which cannot be produced with projected light.');
  if (palette.some((p) => !p.projectable)) warnings.add('Black regions are left unlit (no gobo is created for black).');

  return {
    svg: new XMLSerializer().serializeToString(root),
    viewBox,
    aspect: viewBox.w / viewBox.h,
    palette,
    warnings: [...warnings],
    fills,
    additiveHint,
  };
}

function rasterSize(aspect: number, longest: number) {
  return aspect >= 1
    ? { w: longest, h: Math.max(1, Math.round(longest / aspect)) }
    : { w: Math.max(1, Math.round(longest * aspect)), h: longest };
}

async function rasterize(root: SVGSVGElement, aspect: number, longest: number): Promise<HTMLCanvasElement> {
  const { w, h } = rasterSize(aspect, longest);
  root.setAttribute('width', String(w));
  root.setAttribute('height', String(h));
  root.setAttribute('preserveAspectRatio', 'none');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function prepared(a: AnalyzedSvg): SVGSVGElement {
  const root = parse(a.svg);
  const { x, y, w, h } = a.viewBox;
  root.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  return root;
}

/**
 * One black/white mask per color. Shapes are painted in document order with the layer's
 * shapes white. In 'occlude' mode every other shape is painted black, so later shapes hide
 * earlier ones and the masks partition the artwork. In 'additive' mode other shapes are not
 * painted, so each mask holds its color's full shapes and overlapping light mixes.
 */
export async function rasterizeMasks(a: AnalyzedSvg, colors: string[], blend: OverlapMode, longest = 2048) {
  const masks = new Map<string, HTMLCanvasElement>();
  for (const hex of colors) {
    const root = prepared(a);
    root.querySelectorAll('image, use').forEach((el) => el.remove());
    // Groups can carry filters, blending and opacity too; masks must be plain black/white paint.
    for (const el of root.querySelectorAll('*')) {
      const st = (el as SVGElement).style;
      if (!st) continue;
      st.setProperty('filter', 'none', 'important');
      st.setProperty('mix-blend-mode', 'normal', 'important');
      st.setProperty('opacity', '1', 'important');
    }
    root.querySelectorAll(SHAPES).forEach((el, i) => {
      if (!isRenderedShape(el)) return;
      const s = (el as SVGElement).style;
      const lit = a.fills[i] === hex;
      const occludes = blend === 'occlude' && a.fills[i] !== null;
      s.setProperty('fill', lit ? '#fff' : occludes ? '#000' : 'none', 'important');
      s.setProperty('stroke', 'none', 'important');
      s.setProperty('fill-opacity', '1', 'important');
      s.setProperty('opacity', '1', 'important');
    });
    masks.set(hex, await rasterize(root, a.aspect, longest));
  }
  return masks;
}

/** Full-color raster of the artwork for the reference overlay. */
export function rasterizeReference(a: AnalyzedSvg, longest = 1024) {
  return rasterize(prepared(a), a.aspect, longest);
}
