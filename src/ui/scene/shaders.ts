// GLSL for the Hanami scene. Everything is drawn in CSS px, flat cel tones with hard band edges,
// and ink lines antialiased from signed distances (smoothstep over fwidth).

import { CLOUD_BUMPS } from "./compose";

export const MAX_CIRCLES = 56;
export const MAX_CLOUDS = 4;

/** Full-screen triangle pair in clip space; the fragment works from gl_FragCoord. */
export const screenVert = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const skyFrag = /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uShift;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uCloud;
uniform vec3 uCloudShade;
uniform vec3 uInk;
uniform vec3 uMoon;
uniform vec3 uLantern;
uniform vec3 uStar;
uniform float uNight;
uniform float uHorizonY;
uniform float uLine;
uniform vec4 uCircles[${MAX_CIRCLES}];
uniform vec4 uCloudInfo[${MAX_CLOUDS}];
uniform vec3 uCloudBound[${MAX_CLOUDS}];
uniform vec4 uCloudBody[${MAX_CLOUDS}];
uniform int uCloudCount;
uniform vec3 uMoonPos;
uniform vec3 uLanternPos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// uCloudInfo: (flat underside y, first lobe, lobe count, shade reach); uCloudBody: box centre,
// half size. \`arc\` is the distance to the upper outline of the nearest front lobe, for the inner
// ink lines where one lobe overlaps another.
float cloudSd(vec2 p, vec4 info, vec4 body, out float arc) {
  vec2 q = abs(p - body.xy) - body.zw;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  int start = int(info.y + 0.5);
  int count = int(info.z + 0.5);
  float front = 1e5;
  float back = 1e5;
  for (int i = 0; i < ${CLOUD_BUMPS}; i++) {
    if (i >= count) break;
    vec4 c = uCircles[start + i];
    float di = length(p - c.xy) - c.z;
    d = min(d, di);
    if (c.w > 0.5) {
      if (p.y < c.y) front = min(front, abs(di));
    } else back = min(back, di);
  }
  arc = back < 0.0 ? front : 1e5;
  // Cumulus sit on a flat, level underside.
  return max(d, p.y - info.x);
}

void main() {
  vec2 px = gl_FragCoord.xy / uDpr;
  px.y = uRes.y - px.y;
  px -= uShift;
  float t = clamp(px.y / uHorizonY, 0.0, 1.0);
  vec3 col = mix(uTop, uHorizon, pow(t, 1.35));

  if (uNight > 0.5) {
    // Sparse stars: one candidate per cell, a dot with a faint four-point glint.
    float cs = 52.0;
    vec2 cell = floor(px / cs);
    float h = hash(cell);
    if (h < 0.2) {
      vec2 sp = (cell + 0.2 + 0.6 * vec2(hash(cell + 3.1), hash(cell + 7.7))) * cs;
      vec2 q = abs(px - sp);
      float r = 0.7 + 1.4 * hash(cell + 1.3);
      float dotS = 1.0 - smoothstep(r - 0.6, r + 0.6, length(q));
      float arms = (1.0 - smoothstep(0.2, 0.8, min(q.x, q.y))) * (1.0 - smoothstep(r, r * 4.0, max(q.x, q.y))) * step(0.12, h);
      col = mix(col, uStar, max(dotS, arms * 0.7) * (1.0 - t * t));
    }
    // Moon: flat disc, two pale maria, and a soft halo faked with an exponential falloff.
    float md = length(px - uMoonPos.xy) - uMoonPos.z;
    col = mix(col, uMoon, exp(-max(md, 0.0) / (uMoonPos.z * 0.8)) * 0.32);
    float disc = 1.0 - smoothstep(-0.8, 0.8, md);
    vec3 moon = uMoon;
    float m1 = length(px - uMoonPos.xy - vec2(-0.28, -0.18) * uMoonPos.z) - uMoonPos.z * 0.3;
    float m2 = length(px - uMoonPos.xy - vec2(0.3, 0.32) * uMoonPos.z) - uMoonPos.z * 0.2;
    moon = mix(moon, mix(uMoon, uLantern, 0.22), (1.0 - smoothstep(-0.8, 0.8, min(m1, m2))));
    col = mix(col, moon, disc);
  }

  float lg = exp(-length((px - uLanternPos.xy) * vec2(0.55, 1.0)) / uLanternPos.z);
  col = mix(col, uLantern, lg * 0.8 * uNight);

  float aa = 0.75;
  for (int ci = 0; ci < ${MAX_CLOUDS}; ci++) {
    if (ci >= uCloudCount) break;
    vec4 info = uCloudInfo[ci];
    vec3 bound = uCloudBound[ci];
    if (length(px - bound.xy) - bound.z > uLine + 2.0) continue;
    vec4 body = uCloudBody[ci];
    float arc;
    float d = cloudSd(px, info, body, arc);
    if (d > uLine + 2.0) continue;
    // One hard shade band: anything whose neighbour toward the lower right is outside the cloud.
    float arc2;
    float s = cloudSd(px + vec2(0.55, 0.85) * info.w, info, body, arc2);
    vec3 cc = mix(uCloud, uCloudShade, smoothstep(-aa, aa, s));
    cc = mix(cc, uLantern, lg * 0.45 * uNight);
    col = mix(col, cc, 1.0 - smoothstep(-aa, aa, d));
    col = mix(col, uInk, 1.0 - smoothstep(uLine * 0.5 - aa, uLine * 0.5 + aa, abs(d)));
    // Inner lobe lines are finer than the silhouette and stop short of it.
    // They curl in from the silhouette only a short way, like a brush flick.
    float inner = (1.0 - smoothstep(uLine * 0.3 - aa, uLine * 0.3 + aa, arc)) * step(d, -uLine * 2.0) * step(-uLine * 12.0, d);
    col = mix(col, uInk, inner);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export const toonVert = /* glsl */ `
varying vec3 vN;
varying vec2 vUv;
void main() {
  vN = normalize(normalMatrix * normal);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Three-step toon bark (light, base, shade), lenticel dashes, and a pink rim from the lanterns at night. */
export const toonFrag = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uBase;
uniform vec3 uShade;
uniform vec3 uRim;
uniform float uNight;
varying vec3 vN;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec3 n = normalize(vN);
  float d = dot(n, normalize(vec3(-0.5, 0.7, 0.55)));
  vec3 c = d > 0.42 ? uLight : (d > -0.08 ? uBase : uShade);
  float seg = floor(vUv.x);
  float f = fract(vUv.x);
  float dash = step(f, 0.1) * step(abs(vUv.y - 0.3 - 0.4 * hash(seg * 1.7)), 0.09) * step(0.4, hash(seg * 3.1));
  c = mix(c, uShade, dash);
  float rim = step(0.6, 1.0 - n.z) * step(0.3, dot(normalize(n.xy + 1e-4), normalize(vec2(0.4, -1.0))));
  c = mix(c, uRim, rim * uNight);
  gl_FragColor = vec4(c, 1.0);
}
`;

/** Inverted hull: back faces pushed out along the normal and filled with ink. */
export const hullVert = /* glsl */ `
uniform float uOutline;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uOutline, 1.0);
}
`;

export const inkFrag = /* glsl */ `
uniform vec3 uInk;
void main() { gl_FragColor = vec4(uInk, 1.0); }
`;

export const blossomVert = /* glsl */ `
attribute float aTone;
attribute float aBud;
attribute float aSize;
varying vec2 vP;
varying float vTone;
varying float vBud;
varying float vPx;
void main() {
  vP = position.xy * 2.0;
  vTone = aTone;
  vBud = aBud;
  vPx = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

/** A five-petal sakura from an SDF: notched petals, a deep pink heart, stamens, an ink edge. */
export const blossomFrag = /* glsl */ `
uniform vec3 uPetal;
uniform vec3 uPale;
uniform vec3 uShade;
uniform vec3 uDeep;
uniform vec3 uInk;
uniform float uLine;
varying vec2 vP;
varying float vTone;
varying float vBud;
varying float vPx;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float petal(vec2 p) {
  vec2 q = (p - vec2(0.0, 0.5)) / vec2(0.37, 0.5);
  float d = (length(q) - 1.0) * 0.37;
  float notch = length((p - vec2(0.0, 1.03)) * vec2(1.0, 0.75)) - 0.12;
  return max(d, -notch);
}
void main() {
  vec2 p = vP / 0.98;
  float r = length(p);
  float lw = uLine * 2.0 / vPx;
  float d;
  vec3 c;
  if (vBud > 0.5) {
    vec2 q = (p - vec2(0.0, 0.1)) / vec2(0.5, 0.82);
    q.x *= 1.0 + 0.35 * clamp(-p.y, 0.0, 1.0);
    d = (length(q) - 1.0) * 0.5;
    float aaB = fwidth(d);
    c = mix(uShade, uDeep, smoothstep(-aaB, aaB, p.x * 0.6 - p.y * 0.2 + 0.05));
  } else {
    d = 1e5;
    float lx = 0.0;
    for (int k = 0; k < 5; k++) {
      vec2 q = rot(float(k) * 1.2566371) * p;
      float dk = petal(q);
      if (dk < d) { d = dk; lx = q.x; }
    }
    float aaF = fwidth(r) * 1.2;
    c = mix(uPetal, uPale, vTone * 0.55);
    // Two tones: the far half of each petal sits in a hard cel shade.
    c = mix(c, mix(c, uShade, 0.45), smoothstep(-aaF, aaF, lx - 0.08) * step(0.3, r));
    float star = 0.36 + 0.06 * cos(atan(p.y, p.x) * 5.0);
    c = mix(c, uShade, 1.0 - smoothstep(star - aaF, star + aaF, r));
    float ang = atan(p.y, p.x);
    float sector = 6.2831853 / 9.0;
    float sa = mod(ang + 0.2, sector) - sector * 0.5;
    vec2 sp = vec2(cos(sa), sin(sa)) * r - vec2(0.27, 0.0);
    float stamen = 1.0 - smoothstep(0.045 - aaF, 0.045 + aaF, length(sp));
    float filament = (1.0 - smoothstep(0.012, 0.012 + aaF, abs(sin(sa) * r))) * step(r, 0.27);
    c = mix(c, uDeep, max(stamen, filament * 0.8));
    c = mix(c, uDeep, 1.0 - smoothstep(0.1 - aaF, 0.1 + aaF, r));
  }
  float aa = max(fwidth(d), 1e-4);
  float alpha = 1.0 - smoothstep(-aa, aa, d);
  if (alpha < 0.01) discard;
  c = mix(c, uInk, smoothstep(-lw - aa, -lw + aa, d));
  gl_FragColor = vec4(c, alpha);
}
`;

export const petalVert = /* glsl */ `
attribute float aAlpha;
attribute float aTone;
varying vec2 vP;
varying float vAlpha;
varying float vFace;
varying float vTone;
void main() {
  vP = position.xy * 2.0;
  vAlpha = aAlpha;
  vTone = aTone;
  vFace = normalize(mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0)).z;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

/** One falling petal: a notched teardrop, lighter face-on, shaded on its back and edge-on. */
export const petalFrag = /* glsl */ `
uniform vec3 uPetal;
uniform vec3 uPale;
uniform vec3 uShade;
uniform vec3 uDeep;
uniform vec3 uInk;
varying vec2 vP;
varying float vAlpha;
varying float vFace;
varying float vTone;
void main() {
  vec2 p = vP;
  vec2 q = p / vec2(0.7, 0.96);
  q.x *= 1.0 + 0.55 * clamp(-p.y, 0.0, 1.0);
  float d = (length(q) - 1.0) * 0.7;
  float notch = length((p - vec2(0.0, 1.0)) * vec2(1.0, 0.7)) - 0.2;
  d = max(d, -notch);
  float aa = max(fwidth(d), 1e-4);
  float alpha = (1.0 - smoothstep(-aa, aa, d)) * vAlpha;
  if (alpha < 0.01) discard;
  float face = abs(vFace);
  vec3 c = vFace > 0.0 ? mix(uPetal, uPale, 0.3 + vTone * 0.4) : uShade;
  c = mix(c, uShade, step(face, 0.32));
  c = mix(c, uDeep, (1.0 - smoothstep(0.18, 0.26, length(p - vec2(0.0, -0.78)))) * 0.8);
  c = mix(c, uInk, smoothstep(-0.09 - aa, -0.09 + aa, d));
  gl_FragColor = vec4(c, alpha);
}
`;

/** Puts the cached still (sky, branch, blossoms) on screen under the flying petals. */
export const presentFrag = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uSize;
void main() { gl_FragColor = texture2D(uTex, gl_FragCoord.xy / uSize); }
`;
