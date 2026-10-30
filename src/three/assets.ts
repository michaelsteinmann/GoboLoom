import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, type Texture } from 'three';

/**
 * GPU textures derived from the uploaded SVG. Kept outside the Zustand store because
 * they are not serializable; the store's `assetsVersion` signals when they change.
 */
export const assets = {
  masks: new Map<string, Texture>(),
  maskCanvases: new Map<string, HTMLCanvasElement>(),
  reference: null as Texture | null,
};

// Textures keep the default (no) color space: shaders pass sRGB values through untouched.
function toTexture(canvas: HTMLCanvasElement) {
  const tex = new CanvasTexture(canvas);
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

export function setAssets(masks: Map<string, HTMLCanvasElement>, reference: HTMLCanvasElement | null) {
  assets.masks.forEach((t) => t.dispose());
  assets.reference?.dispose();
  assets.masks = new Map([...masks].map(([hex, canvas]) => [hex, toTexture(canvas)]));
  assets.maskCanvases = masks;
  assets.reference = reference ? toTexture(reference) : null;
}
