import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { Gobo } from '../types';
import type { Rect } from '../lib/geometry';
import { poseCamera } from '../lib/geometry';
import { fullscreenVert, slideFrag } from './shaders';

export const SLIDE_RESOLUTION = 2048;

export function createSlideTarget(width = SLIDE_RESOLUTION, height = width, mipmaps = true) {
  const rt = new WebGLRenderTarget(width, height, {
    generateMipmaps: mipmaps,
    minFilter: mipmaps ? LinearMipmapLinearFilter : LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
  rt.texture.anisotropy = 8;
  return rt;
}

/** Renders gobo slides (pre-distorted, calibrated masks) into render targets. */
export class SlideRenderer {
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material = new ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: slideFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uMask: { value: null },
      uMode: { value: 0 },
      uBakeInvViewProj: { value: new Matrix4() },
      uArtRect: { value: new Vector4() },
      uArtAspect: { value: 1 },
      uWarp: { value: new Vector2() },
      uOffset: { value: new Vector2() },
      uRotation: { value: 0 },
      uScale: { value: 1 },
      uFeather: { value: 0 },
    },
  });

  constructor(private renderer: WebGLRenderer) {
    this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.material));
  }

  render(gobo: Gobo, mask: Texture | undefined, art: Rect, artAspect: number, target: WebGLRenderTarget) {
    const u = this.material.uniforms;
    const pose = gobo.correction.enabled ? gobo.correction.pose : null;
    u.uMask.value = mask ?? null;
    u.uMode.value = pose ? 1 : 0;
    if (pose) {
      const cam = poseCamera(pose);
      u.uBakeInvViewProj.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    }
    u.uArtRect.value.set(art.x0, art.y0, art.w, art.h);
    u.uArtAspect.value = artAspect;
    const c = gobo.calibration;
    u.uWarp.value.set(c.warp.x, c.warp.y);
    u.uOffset.value.set(c.offset.x, c.offset.y);
    u.uRotation.value = (c.rotation * Math.PI) / 180;
    u.uScale.value = c.scale;
    u.uFeather.value = c.feather;

    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    if (mask) this.renderer.render(this.scene, this.camera);
    else this.renderer.clear();
    this.renderer.setRenderTarget(prev);
  }

  /** Render a slide (round aperture, `size` px across) as a canvas, top row first. */
  toCanvas(gobo: Gobo, mask: Texture | undefined, art: Rect, artAspect: number, size: number) {
    const w = size;
    const h = size;
    const rt = createSlideTarget(w, h, false);
    this.render(gobo, mask, art, artAspect, rt);
    const px = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    rt.dispose();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const img = new ImageData(w, h);
    const row = w * 4;
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    return canvas;
  }
}
