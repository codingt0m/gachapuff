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

// Used by the front relief (displaced grid, aH = vertex height) and by the side wall
// (flat silhouette quads stacked behind it, aH = 0, uZ = layer depth). See volume.ts.
export const PUFF_VERTEX = /* glsl */ `
attribute vec2 aPos;
attribute float aH;
uniform vec2 uCenter;   // clip-space centre of the puff square
uniform vec2 uHalf;     // clip-space half size
uniform mat3 uRot;      // tilt rotation
uniform float uCamera;  // camera distance, in half-size units
uniform float uDepth;   // relief depth factor
uniform float uZ;       // extra depth offset (side wall layers)
varying vec2 vUv;
void main() {
  vec3 p = uRot * vec3(aPos, aH * uDepth + uZ);
  float w = (uCamera - p.z) / uCamera;
  gl_Position = vec4(uCenter * w + p.xy * uHalf, -p.z * 0.2 * w, w);
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
}
`;

// Side wall: the print's edge colour, lit by an outward normal, tinted by the finish.
// Kept cheap on purpose: up to ~40 silhouette layers are drawn per frame.
export const SIDE_FRAGMENT = /* glsl */ `
${PRECISION}
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform mat3 uRot;
uniform float uReveal;
uniform vec4 uSideTint;  // rgb + amount
void main() {
  vec4 tex = texture2D(uTex, vUv);
  float a = tex.a;
  if (a < 0.003) discard;
  vec2 e = uTexel * 8.0;
  float al = texture2D(uTex, vUv - vec2(e.x, 0.0), 3.0).a;
  float ar = texture2D(uTex, vUv + vec2(e.x, 0.0), 3.0).a;
  float at = texture2D(uTex, vUv - vec2(0.0, e.y), 3.0).a;
  float ab = texture2D(uTex, vUv + vec2(0.0, e.y), 3.0).a;
  vec2 o = vec2(al - ar, ab - at);
  vec3 n = length(o) > 0.002 ? normalize(vec3(o, 0.0)) : vec3(0.0, 0.0, 1.0);
  vec3 N = normalize(uRot * n);
  vec3 L = normalize(vec3(-0.35, 0.55, 1.0));
  vec3 base = mix(tex.rgb, uSideTint.rgb * (0.6 + 0.6 * dot(tex.rgb, vec3(0.333))), uSideTint.a);
  vec3 col = base * (0.42 + 0.5 * max(dot(N, L), 0.0));
  col = mix(vec3(1.0), col, uReveal);
  gl_FragColor = vec4(col * a, a);
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
// Finish index: see FINISH_INDEX in PuffRenderer.ts.
uniform float uFinish;
uniform float uReveal;   // 0 = white silhouette, 1 = full colour
uniform float uSeed;
uniform float uMotion;   // 1 = full motion, lower = calmer
uniform sampler2D uEngrave;  // engraving mask, same layout as uTex
uniform float uEngraveKind;  // 0 none, 1 signature, 2 serial
uniform sampler2D uNormal;   // relief normal map (volume.ts), same layout as uTex
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

bool isFinish(float id) { return abs(uFinish - id) < 0.5; }

// Brushed metal: the print re-tinted along a dark -> mid -> light ramp (details kept
// through luminance), fine brush lines, and a sheen stretched across the brushing.
vec3 brushedMetal(vec3 base, float lum, float diff, float spec, float rim,
                  vec3 dark, vec3 mid, vec3 light, vec3 hi) {
  vec3 ramp = lum < 0.5 ? mix(dark, mid, lum * 2.0) : mix(mid, light, (lum - 0.5) * 2.0);
  float brushed = noise(vec2(vUv.x * 4.0, vUv.y * 520.0));
  float fine = noise(vec2(vUv.x * 11.0 + 3.0, vUv.y * 1400.0));
  float streak = brushed * 0.65 + fine * 0.35;
  float y = vUv.y - 0.5 + uTilt.y * 1.6 - uTilt.x * 0.5;
  float sheen = exp(-pow(y * 4.5, 2.0)) + exp(-pow((y + 0.42) * 7.0, 2.0)) * 0.5;
  vec3 col = mix(base, ramp, 0.86) * diff * (0.9 + 0.2 * streak);
  col += hi * sheen * (0.2 + 0.55 * streak);
  col += spec * hi * 1.3;
  col += sparkles(vUv + uTilt * 0.03, 30.0, 0.12, 2.2) * hi * 1.3;
  col += rim * hi * 0.5;
  return col;
}

// Small photo studio seen in a reflected direction: a few hard point lights.
float studio(vec3 R) {
  return pow(max(dot(R, normalize(vec3(-0.35, 0.55, 1.0))), 0.0), 70.0)
       + pow(max(dot(R, normalize(vec3(0.55, 0.35, 1.0))), 0.0), 110.0) * 0.8
       + pow(max(dot(R, normalize(vec3(0.15, -0.55, 1.0))), 0.0), 110.0) * 0.7
       + pow(max(dot(R, normalize(vec3(-0.65, -0.2, 1.0))), 0.0), 140.0) * 0.8;
}

// Cut gem. Big facets with their own normal: each one flashes on and off as the
// puff turns (scintillation), the flashes split into colours (dispersion fire),
// facets facing away go dark (contrast = brilliance), the print is refracted and
// colour-split differently through each facet, and facet edges glint.
//   tint / deep: light and dark body colour; clarity: how much of the print shows;
//   fire: dispersion strength; cut: facet grid scale (anisotropic = step cut).
// Returns the colour and an alpha multiplier.
vec4 gem(float spec, float glare, float rim,
         vec3 tint, vec3 deep, float clarity, float fire, vec2 cut) {
  float t = uTime * uMotion;
  vec3 L = normalize(vec3(-0.35, 0.55, 1.0));
  vec3 v = voronoi(vUv * cut + uSeed);
  vec2 fh = hash2(vec2(v.z * 91.0, v.z * 17.0)) - 0.5;
  vec3 NF = normalize(uRot * normalize(vec3(fh * 1.3, 1.0)));
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), NF);

  // Each colour channel sees the lights through a slightly bent ray.
  vec3 disp = vec3(0.05, 0.035, 0.0) * fire;
  vec3 flash = vec3(studio(normalize(R + disp)), studio(R), studio(normalize(R - disp)));
  float flashL = dot(flash, vec3(0.333));

  float shade = mix(0.3, 1.25, smoothstep(0.55, 1.0, dot(NF, L)))
              * (0.8 + 0.4 * hash(vec2(v.z * 5.3, 1.7)));

  vec2 refr = vUv + fh * 0.07 + uTilt * vec2(0.05, -0.05);
  float ca = 0.012;
  vec3 seen = vec3(
    texture2D(uTex, refr + vec2(ca, 0.0)).r,
    texture2D(uTex, refr).g,
    texture2D(uTex, refr - vec2(ca, 0.0)).b);
  vec3 body = mix(deep, tint, smoothstep(0.0, 1.0, 0.15 + luma(seen) * 0.9));
  vec3 col = mix(body, seen * tint * 1.15, clarity) * shade;

  // Fire: some facets light up in a pure spectral colour that shifts with the angle.
  float hue = fract(v.z * 3.7 + R.x * 1.8 + R.y * 1.3);
  float fireGlow = pow(max(dot(R, normalize(vec3(-0.2, 0.3, 1.0))), 0.0), 14.0)
                 * step(0.55, hash(vec2(v.z * 13.1, 4.2)));
  col += hsv2rgb(vec3(hue, 0.85, 1.0)) * fireGlow * fire * 0.9;
  col += flash * mix(vec3(1.0), tint * 1.4, 0.3) * 1.7;

  float edge = smoothstep(0.045, 0.0, v.y);
  float groove = smoothstep(0.12, 0.03, v.y);
  float glint = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(v.z * 37.0 + uTilt.x * 22.0 - uTilt.y * 17.0 + t * 0.8), 5.0);
  col *= 1.0 - 0.25 * groove * (1.0 - edge);
  col += mix(vec3(1.0), tint, 0.3) * edge * glint * 0.75;

  float caustic = smoothstep(0.06, 0.0, voronoi(vUv * 14.0 + vec2(t * 0.12, t * 0.08)).y);
  col += tint * caustic * 0.18;
  col += spec * 0.8 + glare * mix(vec3(1.0), tint, 0.5) * 0.35;
  col += sparkles(vUv + uTilt * 0.04, 36.0, 0.11, 2.0) * 1.6;
  col += rim * mix(vec3(1.0), tint, 0.6) * 0.9;

  float alpha = clamp(mix(0.95, 0.6, clarity) + 0.3 * flashL + 0.25 * edge + 0.3 * rim, 0.0, 1.0);
  return vec4(col, alpha);
}

// ------------------------------------------------------------ extra finishes ---

const float MAX_TILT = 0.38; // tilt.maxAngle in config/motion.ts

// Nearest cell: xy = vector from the point to the cell centre, z = cell id.
vec3 cellVec(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  vec2 mr = vec2(0.0);
  vec2 mg = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash2(n + g) - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  return vec3(mr, hash(n + mg));
}

// Studio seen in a mirror: dark floor, bright horizon, sky, two softboxes.
vec3 chromeEnv(vec3 R) {
  float y = R.y;
  vec3 env = mix(vec3(0.02, 0.02, 0.03), vec3(0.12, 0.12, 0.15), smoothstep(-0.8, -0.14, y));
  env = mix(env, vec3(0.28, 0.31, 0.38), smoothstep(-0.12, -0.06, y));
  env = mix(env, vec3(0.75, 0.84, 0.97), smoothstep(0.05, 0.6, y));
  env += exp(-pow((y + 0.1) * 45.0, 2.0)) * 1.1;
  env += pow(max(dot(R, normalize(vec3(-0.5, 0.5, 1.0))), 0.0), 40.0) * 1.3;
  env += pow(max(dot(R, normalize(vec3(0.6, 0.15, 1.0))), 0.0), 70.0) * 1.0;
  return env;
}

void main() {
  float t = uTime * uMotion;

  // Finishes that move the pixels themselves.
  vec2 uv = vUv;
  float glitchSlot = floor(uTime * mix(1.0, 3.0, uMotion));
  float glitchBurst = 0.0;
  if (isFinish(16.0)) {
    glitchBurst = step(0.6, hash(vec2(glitchSlot, uSeed))) + step(0.2, length(uTilt)) * 0.5;
    float row = floor(vUv.y * 28.0 + hash(vec2(glitchSlot, 1.0)) * 5.0);
    float torn = step(0.7, hash(vec2(row * 1.7, glitchSlot + 3.0)));
    uv.x += (hash(vec2(row, glitchSlot)) - 0.5) * 0.09 * torn * min(glitchBurst, 1.0);
  }

  vec4 tex = texture2D(uTex, uv);
  float a = tex.a;
  if (a < 0.003) discard;
  vec3 base = tex.rgb;
  float lum = luma(base);

  // Inflated relief (normal map, see volume.ts) + print relief from luminance.
  float lx = luma(texture2D(uTex, uv - vec2(uTexel.x, 0.0)).rgb) - luma(texture2D(uTex, uv + vec2(uTexel.x, 0.0)).rgb);
  float ly = luma(texture2D(uTex, uv + vec2(0.0, uTexel.y)).rgb) - luma(texture2D(uTex, uv - vec2(0.0, uTexel.y)).rgb);
  vec3 relief = texture2D(uNormal, uv).xyz * 2.0 - 1.0;
  vec3 nLocal = normalize(relief + vec3(lx, ly, 0.0) * 0.8);
  vec3 N = normalize(uRot * nLocal);
  vec3 L = normalize(vec3(-0.35, 0.55, 1.0));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), 48.0);
  float diff = 0.74 + 0.36 * dot(N, L);

  // Glare band sweeping across the body as it tilts.
  float bandPos = 0.75 + uTilt.x * 1.8 - uTilt.y * 1.8 + sin(uTime * 0.4) * 0.12 * uMotion;
  float glare = exp(-pow((vUv.x * 0.6 + vUv.y * 0.8 - bandPos) * 5.0, 2.0));

  float rim = a * smoothstep(0.97, 0.55, blurredAlpha(uv));
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
  } else if (isFinish(2.0)) {
    // Golden: brushed gold leaf.
    col = brushedMetal(base, lum, diff, spec, rim,
      vec3(0.22, 0.11, 0.02), vec3(0.86, 0.58, 0.13), vec3(1.0, 0.95, 0.72), vec3(1.0, 0.88, 0.55));
  } else if (isFinish(6.0)) {
    // Silver: cold brushed steel-silver.
    col = brushedMetal(base, lum, diff, spec, rim,
      vec3(0.07, 0.08, 0.1), vec3(0.46, 0.49, 0.54), vec3(0.9, 0.92, 0.95), vec3(0.85, 0.9, 1.0));
  } else if (isFinish(7.0)) {
    // Bronze: warm brushed bronze.
    col = brushedMetal(base, lum, diff, spec, rim,
      vec3(0.24, 0.09, 0.07), vec3(0.86, 0.52, 0.44), vec3(1.0, 0.89, 0.84), vec3(1.0, 0.8, 0.74));
  } else if (isFinish(3.0)) {
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
  } else if (isFinish(4.0)) {
    // Crystal: clear brilliant cut, strong rainbow fire.
    vec4 g = gem(spec, glare, rim,
      vec3(0.86, 0.95, 1.05), vec3(0.08, 0.13, 0.22), 0.6, 1.0, vec2(11.0, 11.0));
    col = g.rgb;
    a *= g.a;
  } else if (isFinish(8.0)) {
    // Ruby: deep red body, pinkish flashes, a slow red fluorescence.
    vec4 g = gem(spec, glare, rim,
      vec3(1.0, 0.1, 0.2), vec3(0.18, 0.0, 0.03), 0.12, 0.35, vec2(10.0, 10.0));
    col = g.rgb + vec3(1.0, 0.08, 0.2) * 0.12 * (0.6 + 0.4 * sin(uTime * 1.3 * uMotion));
    a *= g.a;
  } else if (isFinish(9.0)) {
    // Emerald: long step-cut facets, green body, mossy inclusions ("jardin").
    vec4 g = gem(spec, glare, rim,
      vec3(0.12, 0.85, 0.46), vec3(0.0, 0.12, 0.06), 0.12, 0.3, vec2(20.0, 5.0));
    float inc = fbm(vUv * vec2(9.0, 12.0) + uSeed * 3.1);
    col = g.rgb * mix(1.0, 0.6, smoothstep(0.55, 0.8, inc));
    a *= g.a;
  } else if (isFinish(10.0)) {
    // Amethyst: violet body with colour zoning (darker and lighter bands), lilac flashes.
    vec4 g = gem(spec, glare, rim,
      vec3(0.74, 0.32, 1.0), vec3(0.12, 0.02, 0.22), 0.15, 0.4, vec2(10.0, 12.0));
    float zone = smoothstep(0.3, 0.75, fbm(vec2(vUv.x * 2.0, vUv.y * 7.0) + uSeed));
    col = g.rgb * mix(0.7, 1.2, zone);
    a *= g.a;
  } else if (isFinish(11.0)) {
    // Lava: dark crust split by glowing cracks, magma pulsing and flowing, embers rising.
    vec2 flow = vUv * vec2(7.0, 9.0) + vec2(0.0, t * 0.06);
    float warp = fbm(flow * 0.8 + uSeed);
    vec3 v = voronoi(flow + warp * 0.8);
    float crack = smoothstep(0.1, 0.0, v.y);
    float near = smoothstep(0.28, 0.0, v.y);
    float heat = 0.65 + 0.35 * sin(t * 1.6 + v.z * 6.283);
    float magma = fbm(vUv * 5.0 + vec2(0.0, -t * 0.15));
    vec3 glow = mix(vec3(0.9, 0.12, 0.0), vec3(1.0, 0.78, 0.25), magma * heat);
    col = (vec3(0.07, 0.035, 0.025) + base * 0.12) * diff;
    col += glow * crack * heat * 1.8 + glow * near * heat * 0.3;
    col += vec3(1.0, 0.45, 0.1) * rim * 0.7 * heat;
    col += sparkles(vUv + vec2(0.0, t * 0.08), 34.0, 0.12, 2.0) * vec3(1.0, 0.6, 0.2) * 1.5;
    col += spec * 0.15;
  } else if (isFinish(12.0)) {
    // Frost: the puff behind frosted glass (blurred, cold print), fern-like ice crystals
    // growing thick from the edges, snow settled on the top edges, glittering ice.
    // Where the finger points (the tilt follows the pointer) the frost melts into a
    // clear wet patch showing the sharp print.
    vec2 ptr = vec2(0.5 + uTilt.x / MAX_TILT * 0.45, 0.5 + uTilt.y / MAX_TILT * 0.45);
    float clear = 1.0 - smoothstep(0.07, 0.22, distance(vUv, ptr));
    vec3 blurry = texture2D(uTex, uv, 3.0).rgb;
    vec3 frosted = mix(vec3(luma(blurry)), blurry, 0.4) * vec3(0.8, 0.92, 1.1) * 0.75
                 + vec3(0.16, 0.2, 0.26);
    // One fern per cell: herringbone barbs off a spine, each cell its own direction.
    vec3 c = cellVec(vUv * vec2(5.0, 6.5) + uSeed);
    float ang = c.z * 6.2831;
    vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (-c.xy);
    float spine = exp(-pow(q.y / 0.035, 2.0));
    float barbs = pow(0.5 + 0.5 * sin((q.x + abs(q.y) * 1.3) * 45.0), 5.0)
                * smoothstep(0.42, 0.04, abs(q.y));
    float fern = max(spine, barbs * 0.85) * smoothstep(0.75, 0.2, length(q));
    // Coverage: thick near the edges, patchy inside, slowly breathing.
    float n = fbm(vUv * 6.0 + uSeed);
    float cover = clamp((1.0 - blurredAlpha(uv)) * 3.0 + n * 1.2 - 0.35 + 0.06 * sin(t * 0.3), 0.0, 1.0);
    vec3 ice = frosted * (0.9 + 0.2 * diff);
    ice = mix(ice, vec3(0.94, 0.97, 1.0), clamp(fern * (0.6 + 0.4 * cover) + cover * 0.4, 0.0, 0.95));
    // Snow on the top edges (nothing above them).
    float above = blurredAlpha(uv - vec2(0.0, uTexel.y * 8.0));
    float snow = smoothstep(0.75, 0.3, above) * smoothstep(0.35, 0.65, noise(vUv * vec2(40.0, 10.0)) + 0.25);
    ice = mix(ice, vec3(0.98, 0.99, 1.0), snow);
    vec3 wet = base * diff + glare * 0.35 + spec * 1.3;
    col = mix(ice, wet, clear * (1.0 - snow));
    float iceMask = 1.0 - clear;
    col += sparkles(vUv + uTilt * 0.05, 70.0, 0.08, 3.0) * 1.8 * iceMask;
    col += sparkles(vUv + 5.0 - uTilt * 0.03, 32.0, 0.13, 2.0) * 1.3 * iceMask;
    col += spec * 0.5 * iceMask;
    col += rim * vec3(0.75, 0.9, 1.0) * 0.9;
  } else if (isFinish(16.0)) {
    // Glitch: VHS tape gone wrong. Colour split, scan lines, torn rows and noise
    // blocks in bursts (at most 3 changes per second), worse when tilted.
    float burst = min(glitchBurst, 1.0);
    float off = 0.005 + 0.02 * burst;
    col = vec3(texture2D(uTex, uv + vec2(off, 0.0)).r, base.g, texture2D(uTex, uv - vec2(off, 0.0)).b) * diff;
    col *= 0.85 + 0.15 * sin(gl_FragCoord.y * 1.6);
    vec2 blk = floor(vUv * vec2(10.0, 30.0));
    float blockOn = step(0.93, hash(blk + glitchSlot)) * burst;
    col = mix(col, vec3(hash(blk + 1.0), hash(blk + 2.0), hash(blk + 3.0)) * vec3(0.3, 1.0, 1.0), blockOn * 0.8);
    col += vec3(0.0, 0.04, 0.07) + (hash(vUv * 512.0 + glitchSlot) - 0.5) * 0.08;
    col += spec * 0.3 + glare * 0.1;
  } else if (isFinish(17.0)) {
    // Liquid chrome: a rippling mirror reflecting a studio.
    vec2 rip = vec2(noise(vUv * 3.5 + vec2(t * 0.3, 0.0)), noise(vUv * 3.5 + vec2(0.0, t * 0.25) + 5.0)) - 0.5;
    rip += (vec2(noise(vUv * 19.0 - t * 0.5), noise(vUv * 19.0 + 9.0 + t * 0.45)) - 0.5) * 0.35;
    vec3 Nc = normalize(uRot * normalize(nLocal + vec3(rip * 1.7, 0.0)));
    col = chromeEnv(reflect(vec3(0.0, 0.0, -1.0), Nc)) * (0.85 + 0.3 * lum) + base * 0.06;
    col += rim * 0.3;
  } else {
    // Cosmic: a nebula inside the silhouette, parallax stars.
    vec2 p = vUv * vec2(6.0, 8.0);
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

  // Engraving laid over the finish: gold foil signature or laser-etched serial.
  if (uEngraveKind > 0.5) {
    float m = texture2D(uEngrave, vUv).a;
    if (m > 0.01) {
      if (uEngraveKind < 1.5) {
        vec3 foil = vec3(1.0, 0.78, 0.3) * (0.7 + 0.7 * glare + 0.9 * spec)
                  + sparkles(vUv + uTilt * 0.03, 60.0, 0.1, 3.0) * 1.5;
        col = mix(col, foil, m * 0.95);
      } else {
        float shifted = texture2D(uEngrave, vUv + uTexel).a;
        vec3 etched = col * 0.2 + vec3(0.9, 0.95, 1.0) * 0.7 * (0.7 + glare);
        col = mix(col, etched, m) + vec3(1.0) * clamp(m - shifted, 0.0, 1.0) * 0.6;
      }
    }
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
attribute vec4 aData;   // alpha, seed, gradient position, shape (1 = ring)
varying vec2 vUv;
varying vec4 vData;
void main() {
  vUv = aUv;
  vData = aData;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const SMOKE_FRAGMENT = /* glsl */ `
${PRECISION}
varying vec2 vUv;
varying vec4 vData;       // alpha, seed, position along the plume, sprite (0 cloud, 1 ring, 2 heart, 3 star)
// 0 white, 1 solid, 2 gradient (along the plume), 3 rainbow, 4 glitter,
// 5 halo (core -> edge), 6 swirl (marbled), 7 alternate (one colour per puff)
uniform float uKind;
uniform float uColorCount;
uniform float uTime;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
${NOISE}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// The 2 or 3 smoke colours spread over [0, 1].
vec3 ramp(float k) {
  k = clamp(k, 0.0, 1.0);
  if (uColorCount < 2.5) return mix(uC0, uC1, k);
  return k < 0.5 ? mix(uC0, uC1, k * 2.0) : mix(uC1, uC2, (k - 0.5) * 2.0);
}

vec3 pick(float i) {
  if (i < 0.5) return uC0;
  if (i < 1.5) return uC1;
  return uC2;
}

vec3 smokeColor(float k, float seed, float r, float n) {
  if (uKind < 0.5) return vec3(0.95, 0.96, 1.0);
  if (uKind < 1.5) return uC0;
  if (uKind < 2.5) return ramp(k);
  if (uKind < 3.5) return hsv2rgb(vec3(fract(k * 0.9 + seed * 0.25 - uTime * 0.12), 0.7, 1.0));
  if (uKind < 4.5) return uC0;
  if (uKind < 5.5) return ramp(smoothstep(0.1, 0.9, r + (n - 0.5) * 0.4));
  if (uKind < 6.5) {
    float m = fbm(vUv * 2.2 + seed * 17.0 + vec2(uTime * 0.15, -uTime * 0.1));
    return ramp(smoothstep(0.38, 0.62, fbm(vUv * 3.0 - m * 2.5 + seed * 5.0)));
  }
  return pick(floor(fract(seed * 7.31) * uColorCount));
}

float dot2(vec2 v) { return dot(v, v); }

float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

float sdStar5(vec2 p, float r, float rf) {
  vec2 k1 = vec2(0.809016994375, -0.587785252292);
  vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// A smoky filled shape: soft body, denser rim, edges frayed by the noise.
float shapeAlpha(float d, float n) {
  float dd = d + (n - 0.5) * 0.12;
  float body = 1.0 - smoothstep(-0.04, 0.06, dd);
  float rim = exp(-pow(dd / 0.07, 2.0));
  return body * 0.5 + rim * 0.65;
}

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float n = fbm(vUv * 2.6 + vData.y * 13.7);
  float a;
  if (vData.w > 2.5) {
    a = shapeAlpha(sdStar5(vUv, 0.8, 0.45), n) * vData.x * 1.4;
  } else if (vData.w > 1.5) {
    a = shapeAlpha(sdHeart(vUv * 0.75 + vec2(0.0, 0.5)) / 0.75, n) * vData.x * 1.4;
  } else if (vData.w > 0.5) {
    // Smoke ring: a soft, slightly wobbly torus seen from the side.
    float ring = r + (n - 0.5) * 0.18;
    a = exp(-pow((ring - 0.62) / 0.13, 2.0)) * vData.x * 1.5 * (0.6 + 0.6 * n);
  } else {
    float wisp = fbm(vUv * 5.0 - vData.y * 7.1 + n);
    float soft = 1.0 - smoothstep(0.05, 1.0, r + (n - 0.5) * 1.0);
    a = soft * vData.x * (0.2 + 0.9 * n) * (0.6 + 0.6 * wisp);
  }
  vec3 col = smokeColor(vData.z, vData.y, r, n) * (0.72 + 0.4 * n) * a;
  if (uKind > 3.5 && uKind < 4.5) {
    // Glitter: tiny twinkling specks carried by the smoke.
    vec2 g = vUv * 9.0 + vData.y * 31.0;
    float h = hash(floor(g));
    float twinkle = pow(max(0.0, sin(uTime * 5.0 + h * 40.0)), 8.0);
    float speck = smoothstep(0.2, 0.0, length(fract(g) - 0.5)) * step(0.72, h) * twinkle
                * vData.x * 2.5 * (1.0 - smoothstep(0.6, 1.0, r));
    col += vec3(1.0) * speck;
    a = min(1.0, a + speck);
  }
  gl_FragColor = vec4(col, a);
}
`;
