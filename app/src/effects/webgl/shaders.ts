/**
 * GLSL (ES 1.0) sources of the puff stage.
 * Every finish effect is masked by the puff's own alpha: it lives on the silhouette.
 */

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const NOISE = /* glsl */ `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash2(vec2 p) {
  float n = hash(p);
  return vec2(n, hash(p + n));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

// ------------------------------------------------------------------- puff ---

export const PUFF_VERTEX = /* glsl */ `
attribute vec2 aPos;
uniform vec2 uCenter;   // clip-space centre of the puff square
uniform vec2 uHalf;     // clip-space half size
uniform mat3 uRot;      // tilt rotation
uniform float uCamera;  // camera distance, in half-size units
varying vec2 vUv;
void main() {
  vec3 p = uRot * vec3(aPos, 0.0);
  float w = (uCamera - p.z) / uCamera;
  gl_Position = vec4(uCenter * w + p.xy * uHalf, 0.0, w);
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
}
`;

export const PUFF_FRAGMENT = /* glsl */ `
${PRECISION}
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform mat3 uRot;
uniform vec2 uTilt;
uniform float uTime;
uniform float uFinish;   // 0 normal, 1 shiny, 2 golden, 3 chromatic, 4 crystal, 5 cosmic
uniform float uReveal;   // 0 = white silhouette, 1 = full colour
uniform float uSeed;
uniform float uMotion;   // 1 = full motion, lower = calmer
${NOISE}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float star(vec2 d, float size) {
  d /= size;
  float core = exp(-dot(d, d) * 6.0);
  float rays = exp(-abs(d.x) * 14.0) * exp(-abs(d.y) * 1.6)
             + exp(-abs(d.y) * 14.0) * exp(-abs(d.x) * 1.6);
  return core + rays * 0.55;
}

// Twinkling stars: only some grid cells host one, at a random spot and size.
// The twinkle phase also follows the tilt, so stars flash as the puff turns.
float sparkles(vec2 uv, float density, float size, float speed) {
  vec2 g = uv * density;
  vec2 id = floor(g);
  if (hash(id + uSeed * 0.37) > 0.38) return 0.0;
  vec2 r = hash2(id * 1.31 + uSeed);
  vec2 d = fract(g) - (0.2 + 0.6 * r);
  float s = size * (0.55 + 0.9 * hash(id + 7.7));
  float phase = hash(id * 1.7 + uSeed) * 6.2831;
  float t = uTime * speed * uMotion + phase + (uTilt.x * 11.0 - uTilt.y * 8.0) * (r.x + 0.4);
  return star(d, s) * pow(max(0.0, sin(t)), 6.0);
}

// Voronoi: x = distance to the cell centre, y = distance to the nearest edge, z = cell id.
vec3 voronoi(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  vec2 mg = vec2(0.0);
  vec2 mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash2(n + g) - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  float me = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = g + hash2(n + g) - f;
      if (dot(mr - r, mr - r) > 0.00001) me = min(me, dot(0.5 * (mr + r), normalize(r - mr)));
    }
  }
  return vec3(sqrt(md), me, hash(n + mg));
}

float blurredAlpha(vec2 uv) { return texture2D(uTex, uv, 3.0).a; }

void main() {
  vec4 tex = texture2D(uTex, vUv);
  float a = tex.a;
  if (a < 0.003) discard;
  vec3 base = tex.rgb;
  float lum = luma(base);

  // Pillow-shaped surface from the blurred silhouette + print relief from luminance.
  vec2 e = uTexel * 8.0;
  float al = blurredAlpha(vUv - vec2(e.x, 0.0));
  float ar = blurredAlpha(vUv + vec2(e.x, 0.0));
  float at = blurredAlpha(vUv - vec2(0.0, e.y));
  float ab = blurredAlpha(vUv + vec2(0.0, e.y));
  float lx = luma(texture2D(uTex, vUv - vec2(uTexel.x, 0.0)).rgb) - luma(texture2D(uTex, vUv + vec2(uTexel.x, 0.0)).rgb);
  float ly = luma(texture2D(uTex, vUv + vec2(0.0, uTexel.y)).rgb) - luma(texture2D(uTex, vUv - vec2(0.0, uTexel.y)).rgb);
  vec3 nLocal = normalize(vec3((al - ar) * 1.4 + lx * 0.8, (ab - at) * 1.4 + ly * 0.8, 1.0));
  vec3 N = normalize(uRot * nLocal);
  vec3 L = normalize(vec3(-0.35, 0.55, 1.0));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), 48.0);
  float diff = 0.82 + 0.28 * dot(N, L);

  // Glare band sweeping across the body as it tilts.
  float bandPos = 0.75 + uTilt.x * 1.8 - uTilt.y * 1.8 + sin(uTime * 0.4) * 0.12 * uMotion;
  float glare = exp(-pow((vUv.x * 0.6 + vUv.y * 0.8 - bandPos) * 5.0, 2.0));

  float rim = a * smoothstep(0.97, 0.55, blurredAlpha(vUv));
  vec3 col = base * diff;

  if (uFinish < 0.5) {
    // Normal: a discreet plastic sheen.
    col += glare * 0.08 + spec * 0.22;
  } else if (uFinish < 1.5) {
    // Shiny: strong sweep + glitter.
    col = base * diff * 1.06;
    col += glare * 0.42 + spec * 0.9;
    col += sparkles(vUv + uTilt * 0.03, 28.0, 0.16, 3.0) * vec3(1.0, 0.97, 0.88) * 2.0;
    col += sparkles(vUv + 7.3 - uTilt * 0.02, 46.0, 0.12, 4.2) * 1.4;
    col += rim * vec3(1.0, 0.95, 0.8) * 0.35;
  } else if (uFinish < 2.5) {
    // Golden: brushed gold leaf, details kept through luminance.
    vec3 gold = lum < 0.5
      ? mix(vec3(0.22, 0.11, 0.02), vec3(0.86, 0.58, 0.13), lum * 2.0)
      : mix(vec3(0.86, 0.58, 0.13), vec3(1.0, 0.95, 0.72), (lum - 0.5) * 2.0);
    float brushed = noise(vec2(vUv.x * 4.0, vUv.y * 520.0));
    float sheen = exp(-pow((vUv.y - 0.5 + uTilt.y * 1.6 - uTilt.x * 0.5) * 4.5, 2.0));
    col = mix(base, gold, 0.86) * diff;
    col += vec3(1.0, 0.86, 0.5) * sheen * (0.25 + 0.45 * brushed);
    col += spec * vec3(1.0, 0.9, 0.6) * 1.3;
    col += sparkles(vUv + uTilt * 0.03, 30.0, 0.12, 2.2) * vec3(1.0, 0.9, 0.6) * 1.3;
    col += rim * vec3(1.0, 0.8, 0.35) * 0.5;
  } else if (uFinish < 3.5) {
    // Chromatic: holographic foil, rainbow bands sliding with the viewing angle.
    float ang = vUv.x * 2.4 + vUv.y * 1.2 + uTilt.x * 2.6 - uTilt.y * 2.0 + lum * 0.3 + uTime * 0.03 * uMotion;
    vec3 rainbow = hsv2rgb(vec3(fract(ang), 0.85, 1.0));
    float bands = pow(0.5 + 0.5 * sin((vUv.x * 0.8 + vUv.y) * 42.0 + uTilt.x * 18.0 - uTilt.y * 14.0), 2.0);
    float lines = 0.5 + 0.5 * sin((vUv.x - vUv.y) * 220.0 + uTilt.x * 40.0);
    float strength = 0.45 + 0.55 * clamp(length(uTilt) * 3.0, 0.0, 1.0);
    float foil = strength * (0.3 + 0.7 * bands) * (0.75 + 0.25 * lines);
    col = mix(col, col * 0.55 + rainbow * 0.8, foil * 0.75);
    col += rainbow * glare * 0.6 + spec * 0.8;
    col += sparkles(vUv + uTilt * 0.05, 40.0, 0.12, 2.6) * hsv2rgb(vec3(fract(ang + 0.5), 0.4, 1.0)) * 1.4;
    col += rim * hsv2rgb(vec3(fract(ang + 0.25), 0.7, 1.0)) * 0.8;
  } else if (uFinish < 4.5) {
    // Crystal: cut facets catching the light, refraction, chromatic aberration, caustics.
    vec3 v = voronoi(vUv * vec2(16.0, 22.0) + uSeed);
    vec2 fh = hash2(vec2(v.z * 91.0, v.z * 17.0)) - 0.5;
    vec3 fn = normalize(vec3(fh * 0.9, 1.0));
    vec3 NF = normalize(uRot * fn);
    float facet = 0.78 + 0.4 * max(dot(NF, L), 0.0);
    float flash = pow(max(dot(reflect(-L, NF), vec3(0.0, 0.0, 1.0)), 0.0), 16.0);
    vec2 refr = vUv + fh * 0.025 + uTilt * vec2(0.03, -0.03);
    float ca = 0.006;
    vec3 seen = vec3(
      texture2D(uTex, refr + vec2(ca, 0.0)).r,
      texture2D(uTex, refr).g,
      texture2D(uTex, refr - vec2(ca, 0.0)).b);
    vec3 ice = vec3(0.72, 0.9, 1.1) * (0.3 + 0.9 * luma(seen));
    col = mix(seen, ice, 0.32) * facet;
    float edge = smoothstep(0.05, 0.0, v.y);
    float caustic = smoothstep(0.05, 0.0, voronoi(vUv * 18.0 + vec2(uTime * 0.15 * uMotion, uTime * 0.1 * uMotion)).y);
    col += flash * 0.55 + edge * (0.18 + 0.2 * sin(uTime * 1.5 * uMotion + v.z * 6.28)) + caustic * 0.2;
    col += spec * 1.0 + glare * 0.3;
    col += sparkles(vUv + uTilt * 0.04, 36.0, 0.11, 2.0) * 1.5;
    col += rim * vec3(0.8, 0.95, 1.0) * 0.9;
    a *= clamp(0.66 + 0.25 * flash + 0.2 * edge + 0.3 * rim, 0.0, 1.0);
  } else {
    // Cosmic: a nebula inside the silhouette, parallax stars.
    vec2 p = vUv * vec2(6.0, 8.0);
    float t = uTime * uMotion;
    float n1 = fbm(p * 1.3 + vec2(t * 0.04, -t * 0.03) + uTilt * 0.8);
    float n2 = fbm(p * 2.1 - n1 * 1.6 + uTilt * 0.4);
    vec3 neb = mix(vec3(0.03, 0.01, 0.12), vec3(0.5, 0.08, 0.7), smoothstep(0.35, 0.65, n1));
    neb = mix(neb, vec3(0.08, 0.72, 0.95), smoothstep(0.45, 0.75, n2) * 0.85);
    neb += vec3(1.0, 0.3, 0.62) * pow(n2, 4.0) * 1.4;
    float stars = sparkles(vUv + uTilt * 0.04, 60.0, 0.12, 2.0) + sparkles(vUv + uTilt * 0.11 + 3.1, 30.0, 0.15, 1.3);
    col = neb * (0.45 + 1.1 * lum) + base * 0.15 + stars * vec3(0.9, 0.95, 1.0) * 1.3;
    col += spec * 0.6 + glare * 0.15;
    col += rim * mix(vec3(0.3, 0.9, 1.0), vec3(1.0, 0.35, 0.8), n1) * 0.9;
  }

  col = mix(vec3(1.0), col, uReveal);
  gl_FragColor = vec4(col * a, a);
}
`;

// ------------------------------------------------------------------ smoke ---
// Smoke = soft particle sprites simulated on the CPU (see SmokeParticles.ts).

export const SMOKE_VERTEX = /* glsl */ `
attribute vec2 aPos;    // clip-space corner
attribute vec2 aUv;     // -1..1 inside the sprite (already rotated)
attribute vec3 aData;   // alpha, seed, gradient position
varying vec2 vUv;
varying vec3 vData;
void main() {
  vUv = aUv;
  vData = aData;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const SMOKE_FRAGMENT = /* glsl */ `
${PRECISION}
varying vec2 vUv;
varying vec3 vData;
uniform float uKind;      // 0 white, 1 solid, 2 gradient
uniform float uColorCount;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
${NOISE}

vec3 smokeColor(float k) {
  if (uKind < 0.5) return vec3(0.95, 0.96, 1.0);
  if (uKind < 1.5) return uC0;
  if (uColorCount < 2.5) return mix(uC0, uC1, k);
  return k < 0.5 ? mix(uC0, uC1, k * 2.0) : mix(uC1, uC2, (k - 0.5) * 2.0);
}

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float n = fbm(vUv * 2.6 + vData.y * 13.7);
  float wisp = fbm(vUv * 5.0 - vData.y * 7.1 + n);
  float soft = 1.0 - smoothstep(0.05, 1.0, r + (n - 0.5) * 1.0);
  float a = soft * vData.x * (0.2 + 0.9 * n) * (0.6 + 0.6 * wisp);
  vec3 col = smokeColor(vData.z) * (0.72 + 0.4 * n);
  gl_FragColor = vec4(col * a, a);
}
`;
