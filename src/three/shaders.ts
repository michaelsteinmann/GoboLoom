// All projection shaders write sRGB-encoded values straight to the framebuffer (no
// color-space conversion), so a fully lit #ff0000 layer shows exactly #ff0000 and
// partitioned masks recombine to the original artwork colors.

export const fullscreenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Renders the gobo slide: what is physically etched on the round gobo.
 * mode 0 = raw artwork mask, contain-fitted inside the round aperture.
 * mode 1 = keystone pre-corrected: each slide pixel is cast through the *baked* projector
 *          pose onto the wall and takes the mask value of the artwork at that wall point.
 * Calibration (offset, rotation, scale, keystone warp, feather) is applied on top.
 */
export const slideFrag = /* glsl */ `
uniform sampler2D uMask;
uniform int uMode;
uniform mat4 uBakeInvViewProj;
uniform vec4 uArtRect;      // x0, y0, w, h on the wall
uniform float uArtAspect;
uniform vec2 uWarp;
uniform vec2 uOffset;
uniform float uRotation;    // radians
uniform float uScale;
uniform float uFeather;     // slide-uv radius
varying vec2 vUv;

float artSample(vec2 a) {
  if (a.x < 0.0 || a.y < 0.0 || a.x > 1.0 || a.y > 1.0) return 0.0;
  return texture2D(uMask, a).r;
}

float baseSlide(vec2 q) {
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return 0.0;
  if (uMode == 0) {
    // artwork rectangle whose diagonal spans the aperture diameter
    vec2 size = vec2(uArtAspect, 1.0) / sqrt(uArtAspect * uArtAspect + 1.0);
    return artSample((q - 0.5) / size + 0.5);
  }
  vec2 ndc = q * 2.0 - 1.0;
  vec4 n = uBakeInvViewProj * vec4(ndc, -1.0, 1.0);
  vec4 f = uBakeInvViewProj * vec4(ndc, 1.0, 1.0);
  n /= n.w;
  f /= f.w;
  vec3 d = f.xyz - n.xyz;
  if (d.z > -1e-6) return 0.0;
  float t = -n.z / d.z;
  if (t < 0.0) return 0.0;
  vec2 w = n.xy + d.xy * t;
  return artSample((w - uArtRect.xy) / uArtRect.zw);
}

// Inverse of the calibration transform: maps an output slide uv back to the base slide.
vec2 uncalibrate(vec2 uv) {
  vec2 p = uv * 2.0 - 1.0;
  p.y /= max(1e-3, 1.0 + uWarp.y * p.x);
  p.x /= max(1e-3, 1.0 + uWarp.x * p.y);
  p -= uOffset;
  float c = cos(-uRotation), s = sin(-uRotation);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  p /= uScale;
  return p * 0.5 + 0.5;
}

void main() {
  vec2 q = uncalibrate(vUv);
  float m = baseSlide(q);
  if (uFeather > 0.0) {
    // 16-tap disc blur for soft gobo edges
    float sum = m;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.39996;                // golden angle
      float r = uFeather * sqrt((float(i) + 0.5) / 16.0);
      sum += baseSlide(uncalibrate(vUv + r * vec2(cos(a), sin(a))));
    }
    m = sum / 17.0;
  }
  // round aperture: everything outside the circle is solid metal
  float r = length(vUv - 0.5) * 2.0;
  m *= 1.0 - smoothstep(1.0 - fwidth(r), 1.0, r);
  gl_FragColor = vec4(vec3(m), 1.0);
}
`;

export const worldVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/** One additive projection pass per gobo: projective texturing of its slide onto the wall. */
export const layerFrag = /* glsl */ `
uniform mat4 uViewProj;     // live projector camera
uniform sampler2D uSlide;
uniform vec3 uColor;
uniform float uIntensity;
uniform vec3 uGoboPos;
uniform float uPhysical;    // 1 = inverse-square + cosine falloff, normalized at the aim point
uniform float uRefFalloff;  // falloff value at the aim point
varying vec3 vWorld;

void main() {
  if (uGoboPos.z <= 0.0) discard;              // behind the wall
  vec4 clip = uViewProj * vec4(vWorld, 1.0);
  if (clip.w <= 0.0) discard;
  vec2 ndc = clip.xy / clip.w;
  if (dot(ndc, ndc) > 1.0) discard;           // round aperture
  float m = texture2D(uSlide, ndc * 0.5 + 0.5).r;
  float k = uIntensity;
  if (uPhysical > 0.5) {
    vec3 d = uGoboPos - vWorld;
    float dist = length(d);
    k *= (d.z / dist) / (dist * dist) / uRefFalloff;
  }
  gl_FragColor = vec4(uColor * m * k, 1.0);
}
`;

/** Unlit wall base: the room's ambient light on a white wall. */
export const wallFrag = /* glsl */ `
uniform float uAmbient;
varying vec3 vWorld;
void main() {
  gl_FragColor = vec4(vec3(0.85 * uAmbient), 1.0);
}
`;

/** Drawn over the projections: reference artwork and alignment grid. */
export const overlayFrag = /* glsl */ `
uniform sampler2D uRef;
uniform float uRefOpacity;
uniform float uGrid;
uniform vec4 uArtRect;
uniform vec2 uWallSize;
varying vec3 vWorld;

float line(float coord, float spacing, float px) {
  float g = abs(fract(coord / spacing - 0.5) - 0.5) * spacing;
  return 1.0 - smoothstep(0.0, fwidth(coord) * px, g);
}

void main() {
  vec4 outc = vec4(0.0);
  vec2 a = (vWorld.xy - uArtRect.xy) / uArtRect.zw;
  bool inArt = a.x >= 0.0 && a.y >= 0.0 && a.x <= 1.0 && a.y <= 1.0;
  if (uRefOpacity > 0.0 && inArt) {
    outc = vec4(texture2D(uRef, a).rgb, uRefOpacity);
  }
  if (uGrid > 0.5) {
    vec2 p = vWorld.xy;
    float minor = max(line(p.x, 0.25, 1.0), line(p.y, 0.25, 1.0));
    float major = max(line(p.x, 1.0, 1.5), line(p.y, 1.0, 1.5));
    float axes = max(line(p.x, 1e4, 2.0) * step(abs(p.y), 0.5), line(p.y, 1e4, 2.0) * step(abs(p.x), 0.5));
    vec2 e = min(a, 1.0 - a) * uArtRect.zw;
    float frame = 0.0;
    if (a.x > -0.01 && a.y > -0.01 && a.x < 1.01 && a.y < 1.01) {
      float edge = min(abs(e.x), abs(e.y));
      frame = 1.0 - smoothstep(0.0, fwidth(edge) * 1.5, edge);
    }
    vec3 gc = vec3(0.35, 0.75, 1.0);
    float ga = max(max(minor * 0.12, major * 0.28), max(axes * 0.7, frame * 0.8));
    outc.rgb = mix(outc.rgb, frame > 0.5 ? vec3(1.0, 0.8, 0.3) : gc, ga);
    outc.a = max(outc.a, ga);
  }
  if (outc.a <= 0.0) discard;
  gl_FragColor = outc;
}
`;
