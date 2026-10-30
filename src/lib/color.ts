const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface ParsedColor {
  hex: string;
  alpha: number;
}

/** Parse hex (#rgb, #rgba, #rrggbb, #rrggbbaa) and rgb()/rgba() in comma or space syntax. */
export function parseColorLiteral(input: string): ParsedColor | null {
  const s = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const alpha = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return { hex: `#${h.slice(0, 6)}`, alpha };
  }
  const fn = /^rgba?\((.*)\)$/.exec(s);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const channel = (p: string, max: number) =>
      p.endsWith('%') ? (parseFloat(p) / 100) * max : parseFloat(p);
    const [r, g, b] = parts.slice(0, 3).map((p) => channel(p, 255));
    const alpha = parts[3] === undefined ? 1 : channel(parts[3], 1);
    if ([r, g, b, alpha].some(Number.isNaN)) return null;
    return { hex: rgbToHex(r, g, b), alpha };
  }
  return null;
}

let probe: HTMLElement | null = null;

/**
 * Normalize any CSS color (including named colors) to #rrggbb using the browser's own
 * color parser. Returns null for invalid or non-solid values.
 */
export function normalizeColor(input: string): ParsedColor | null {
  const literal = parseColorLiteral(input);
  if (literal) return literal;
  if (typeof document === 'undefined' || !/^[a-z]+$/i.test(input.trim())) return null;
  probe ??= document.createElement('span');
  probe.style.color = '';
  probe.style.color = input.trim();
  if (!probe.style.color) return null;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return parseColorLiteral(computed);
}

/** True when additive light cannot produce the color (it would just be "unlit"). */
export function isUnprojectable(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return Math.max(r, g, b) < 8;
}
