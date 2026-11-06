import {
  BackSide,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ColorManagement,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
  type IUniform,
} from "three";
import { CLOUD_CURLS, compose, type Composition, type Layout } from "./compose";
import { burstMs, MAX_PETALS, petalPose, planGust, planStorm, type Petal } from "./gusts";
import { sceneBus, sceneStats, type SceneRequest } from "./bus";
import type { Rect } from "./geom";
import { readPalette, type ScenePalette } from "./tokens";
import * as glsl from "./shaders";

// Flat cel colors must come out exactly as the CSS tokens say (and match the CSS fallback under the
// crossfade), so the whole scene works in sRGB values end to end with no conversions.
ColorManagement.enabled = false;

const rectOf = (sel: string): Rect | null => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const darkScheme = () => window.matchMedia("(prefers-color-scheme: dark)");

type U = Record<string, IUniform>;
const col = () => ({ value: new Color() });

/** Starts the scene in `host`; calls `onReady(true)` once a frame is on the canvas. Returns teardown. */
export function startScene(host: HTMLElement, onReady: (ready: boolean) => void): () => void {
  const canvas = document.createElement("canvas");
  // Our own context check: three reports a failed context creation as a console error.
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: "low-power" });
  if (!gl) return () => {};
  host.appendChild(canvas);

  let failed = false;
  const renderer = new WebGLRenderer({ canvas, context: gl });
  renderer.debug.onShaderError = () => {
    failed = true;
  };
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.autoClear = true;

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const dpr = () => Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);

  const camera = new OrthographicCamera(0, 1, 0, -1, 1, 1000);
  camera.position.z = 500;

  // --- the still: sky, branch, blossoms, rendered once into a multisampled target ---
  const still = new Scene();
  const rt = new WebGLRenderTarget(1, 1, { samples: 4 });

  const quad = new PlaneGeometry(2, 2);
  const skyU: U = {
    uRes: { value: new Vector2() },
    uDpr: { value: 1 },
    uShift: { value: new Vector2() },
    uTop: col(), uHorizon: col(), uCloud: col(), uCloudShade: col(), uInk: col(),
    uMoon: col(), uLantern: col(), uStar: col(),
    uNight: { value: 0 },
    uHorizonY: { value: 1 },
    uLine: { value: 2 },
    uCircles: { value: Array.from({ length: glsl.MAX_CIRCLES }, () => new Vector4()) },
    uCloudInfo: { value: Array.from({ length: glsl.MAX_CLOUDS }, () => new Vector4()) },
    uCloudBound: { value: Array.from({ length: glsl.MAX_CLOUDS }, () => new Vector3()) },
    uCloudBody: { value: Array.from({ length: glsl.MAX_CLOUDS }, () => new Vector4()) },
    uCloudRound: { value: new Array<number>(glsl.MAX_CLOUDS).fill(0) },
    uCurls: { value: Array.from({ length: glsl.MAX_CURLS }, () => new Vector4()) },
    uCloudCount: { value: 0 },
    uMoonPos: { value: new Vector3() },
    uLanternPos: { value: new Vector3() },
  };
  const sky = new Mesh(quad, new ShaderMaterial({ vertexShader: glsl.screenVert, fragmentShader: glsl.skyFrag, uniforms: skyU, depthTest: false, depthWrite: false }));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  still.add(sky);

  const barkU: U = { uLight: col(), uBase: col(), uShade: col(), uRim: col(), uNight: { value: 0 } };
  const barkMat = new ShaderMaterial({ vertexShader: glsl.toonVert, fragmentShader: glsl.toonFrag, uniforms: barkU });
  const hullU: U = { uInk: col(), uOutline: { value: 2 } };
  const hullMat = new ShaderMaterial({ vertexShader: glsl.hullVert, fragmentShader: glsl.inkFrag, uniforms: hullU, side: BackSide });
  const flowerU: U = { uPetal: col(), uPale: col(), uShade: col(), uDeep: col(), uInk: col(), uLine: { value: 1.6 } };
  const flowerMat = new ShaderMaterial({ vertexShader: glsl.blossomVert, fragmentShader: glsl.blossomFrag, uniforms: flowerU, transparent: true, depthWrite: false, side: DoubleSide });

  let branch: Mesh | null = null;
  let hull: Mesh | null = null;
  let flowers: InstancedMesh | null = null;

  // --- the overlay, drawn every frame while petals fly: the cached still plus the petals ---
  const overlay = new Scene();
  const presentU: U = { uTex: { value: rt.texture }, uSize: { value: new Vector2(1, 1) } };
  const present = new Mesh(quad, new ShaderMaterial({ vertexShader: glsl.screenVert, fragmentShader: glsl.presentFrag, uniforms: presentU, depthTest: false, depthWrite: false }));
  present.frustumCulled = false;
  present.renderOrder = -10;
  overlay.add(present);

  const petalU: U = { uPetal: col(), uPale: col(), uShade: col(), uDeep: col(), uInk: col() };
  const petalGeo = new PlaneGeometry(1, 1);
  const alphaAttr = new InstancedBufferAttribute(new Float32Array(MAX_PETALS), 1);
  const toneAttr = new InstancedBufferAttribute(new Float32Array(MAX_PETALS), 1);
  petalGeo.setAttribute("aAlpha", alphaAttr);
  petalGeo.setAttribute("aTone", toneAttr);
  const petals = new InstancedMesh(
    petalGeo,
    new ShaderMaterial({ vertexShader: glsl.petalVert, fragmentShader: glsl.petalFrag, uniforms: petalU, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide }),
    MAX_PETALS,
  );
  petals.count = 0;
  petals.frustumCulled = false;
  overlay.add(petals);

  let comp: Composition | null = null;
  let palette: ScenePalette | null = null;
  let stillDirty = true;
  let size = { w: 0, h: 0 };

  function setColors(p: ScenePalette) {
    const c = p.colors;
    const set = (u: U, name: string, css: string) => (u[name]!.value as Color).setStyle(css);
    set(skyU, "uTop", c["sky-top"]); set(skyU, "uHorizon", c["sky-horizon"]);
    set(skyU, "uCloud", c.cloud); set(skyU, "uCloudShade", c["cloud-shade"]); set(skyU, "uInk", c.ink);
    set(skyU, "uMoon", c.moon); set(skyU, "uLantern", c.lantern); set(skyU, "uStar", c.star);
    skyU.uNight!.value = p.night;
    set(barkU, "uLight", c["bark-light"]); set(barkU, "uBase", c.bark); set(barkU, "uShade", c["bark-shade"]); set(barkU, "uRim", c.rim);
    barkU.uNight!.value = p.night;
    set(hullU, "uInk", c.ink);
    for (const u of [flowerU, petalU]) {
      set(u, "uPetal", c.blossom); set(u, "uPale", c["blossom-pale"]); set(u, "uShade", c["blossom-shade"]);
      set(u, "uDeep", c["blossom-deep"]); set(u, "uInk", c.ink);
    }
  }

  function layout(): Layout {
    const view = { w: size.w, h: size.h };
    const { mode } = sceneBus.get();
    if (mode === "display") return { view, mode, board: rectOf(".dboard"), text: rectOf(".display-clock") };
    return { view, mode, board: rectOf(".board") ?? rectOf(".pause-overlay"), panel: rectOf(".play-side") };
  }

  function buildBranch(c: Composition) {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const radial = 10;
    c.limbs.forEach((limb, li) => {
      const pts = limb.points.map(([x, y], i) => new Vector3(x, -y, (i % 2 ? 6 : -6) * (li % 2 ? 1 : -1)));
      const curve = new CatmullRomCurve3(pts, false, "centripetal");
      const length = curve.getLength();
      const segs = Math.max(16, Math.min(140, Math.round(length / 7)));
      const frames = curve.computeFrenetFrames(segs, false);
      const start = pos.length / 3;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const p = curve.getPointAt(t);
        const r = limb.base + (limb.tip - limb.base) * Math.pow(t, 0.75);
        const N = frames.normals[i]!;
        const B = frames.binormals[i]!;
        for (let j = 0; j <= radial; j++) {
          const v = (j / radial) * Math.PI * 2;
          const nx = -Math.cos(v) * N.x + Math.sin(v) * B.x;
          const ny = -Math.cos(v) * N.y + Math.sin(v) * B.y;
          const nz = -Math.cos(v) * N.z + Math.sin(v) * B.z;
          pos.push(p.x + r * nx, p.y + r * ny, p.z + r * nz);
          nor.push(nx, ny, nz);
          uv.push((t * length) / (20 * c.scale), j / radial);
        }
      }
      for (let i = 0; i < segs; i++)
        for (let j = 0; j < radial; j++) {
          const a = start + i * (radial + 1) + j;
          const b = a + radial + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
    });
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }

  function buildFlowers(c: Composition) {
    // Back to front, so each flower's antialiased ink edge blends over the ones behind it.
    const list = [...c.blossoms].sort((a, b) => a.z - b.z);
    const geo = new PlaneGeometry(1, 1);
    geo.setAttribute("aTone", new InstancedBufferAttribute(Float32Array.from(list, (b) => b.tone), 1));
    geo.setAttribute("aBud", new InstancedBufferAttribute(Float32Array.from(list, (b) => (b.bud ? 1 : 0)), 1));
    geo.setAttribute("aSize", new InstancedBufferAttribute(Float32Array.from(list, (b) => b.size), 1));
    const mesh = new InstancedMesh(geo, flowerMat, Math.max(1, list.length));
    mesh.count = list.length;
    mesh.frustumCulled = false;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Matrix4();
    list.forEach((b, i) => {
      m.makeRotationZ(b.spin);
      e.makeRotationY(b.tilt);
      m.premultiply(e);
      q.setFromRotationMatrix(m);
      m.compose(new Vector3(b.x, -b.y, b.z), q, new Vector3(b.size, b.size, 1));
      mesh.setMatrixAt(i, m);
    });
    return mesh;
  }

  let lastLayout = "";
  function recompose() {
    const l = layout();
    // Observers report sizes that have not really changed (an initial callback, a relayout to the
    // same box); only a new layout earns a new frame.
    const key = JSON.stringify(l, (_k, v: unknown) => (typeof v === "number" ? Math.round(v) : v));
    if (comp && key === lastLayout) return;
    lastLayout = key;
    comp = compose(l);
    for (const o of [branch, hull]) if (o) { still.remove(o); o.geometry.dispose(); }
    if (flowers) { still.remove(flowers); flowers.geometry.dispose(); flowers.dispose(); }
    const geo = buildBranch(comp);
    branch = new Mesh(geo, barkMat);
    hull = new Mesh(geo, hullMat);
    flowers = buildFlowers(comp);
    for (const o of [hull, branch, flowers]) { o.frustumCulled = false; still.add(o); }
    flowers.renderOrder = 5;

    const circles = skyU.uCircles!.value as Vector4[];
    const infos = skyU.uCloudInfo!.value as Vector4[];
    const bounds = skyU.uCloudBound!.value as Vector3[];
    const bodies = skyU.uCloudBody!.value as Vector4[];
    const rounds = skyU.uCloudRound!.value as number[];
    const curls = skyU.uCurls!.value as Vector4[];
    for (const c of curls) c.set(0, 0, 0, 0);
    let n = 0;
    let clouds = 0;
    for (const cl of comp.clouds) {
      const list = cl.circles.slice(0, glsl.MAX_CIRCLES - n);
      if (clouds >= glsl.MAX_CLOUDS || list.length === 0) break;
      // A bounding circle lets the sky shader skip clouds far from the pixel.
      const cx = list.reduce((a, c) => a + c[0], 0) / list.length;
      const cy = list.reduce((a, c) => a + c[1], 0) / list.length;
      const [bx, by, bw, bh] = cl.body;
      const R = Math.max(Math.hypot(Math.abs(bx - cx) + bw, Math.abs(by - cy) + bh), ...list.map(([x, y, r]) => Math.hypot(x - cx, y - cy) + r));
      bodies[clouds]!.set(bx, by, bw, bh);
      rounds[clouds] = cl.round;
      cl.curls.slice(0, CLOUD_CURLS).forEach(([x, y, r, a], k) => curls[clouds * CLOUD_CURLS + k]!.set(x, y, r, a));
      infos[clouds]!.set(cl.base, n, list.length, cl.shade);
      bounds[clouds]!.set(cx, cy, R);
      for (const [x, y, r] of list) circles[n++]!.set(x, y, r, 0);
      clouds++;
    }
    skyU.uCloudCount!.value = clouds;
    (skyU.uMoonPos!.value as Vector3).set(comp.moon.x, comp.moon.y, comp.moon.r);
    (skyU.uLanternPos!.value as Vector3).set(comp.lantern.x, comp.lantern.y, comp.lantern.r);
    skyU.uHorizonY!.value = comp.horizon;
    const line = Math.max(1.5, 2.2 * comp.scale);
    skyU.uLine!.value = line;
    hullU.uOutline!.value = line;
    flowerU.uLine!.value = Math.max(1.1, 1.5 * comp.scale);
    stillDirty = true;
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w === 0 || h === 0) return false;
    const r = dpr();
    // Re-assigning the canvas size clears it even when nothing changed, so skip that case.
    if (w === size.w && h === size.h && r === renderer.getPixelRatio()) return false;
    size = { w, h };
    renderer.setPixelRatio(r);
    renderer.setSize(w, h, false);
    rt.setSize(Math.round(w * r), Math.round(h * r));
    (skyU.uRes!.value as Vector2).set(w, h);
    skyU.uDpr!.value = r;
    (presentU.uSize!.value as Vector2).set(Math.round(w * r), Math.round(h * r));
    camera.right = w;
    camera.bottom = -h;
    camera.updateProjectionMatrix();
    stillDirty = true;
    return true;
  }

  function applyDrift() {
    const [dx, dy] = sceneBus.get().drift;
    camera.position.x = -dx;
    camera.position.y = dy;
    (skyU.uShift!.value as Vector2).set(dx, dy);
    stillDirty = true;
  }

  // --- petals ---
  interface Burst { petals: Petal[]; t: number; ms: number }
  let bursts: Burst[] = [];
  let seed = 1;
  let last = 0;
  let looping = false;
  let lost = false;
  const m4 = new Matrix4();
  const quat = new Quaternion();
  const ax = new Vector3();
  const pv = new Vector3();
  const sv = new Vector3();

  function updatePetals() {
    let n = 0;
    for (const b of bursts)
      for (const p of b.petals) {
        if (n >= MAX_PETALS) break;
        const pose = petalPose(p, b.t);
        if (!pose) continue;
        quat.setFromAxisAngle(ax.set(p.axis[0], p.axis[1], p.axis[2]), pose.angle);
        m4.compose(pv.set(pose.x, -pose.y, 0), quat, sv.set(p.size * 0.8, p.size, 1));
        petals.setMatrixAt(n, m4);
        alphaAttr.setX(n, pose.alpha);
        toneAttr.setX(n, p.tone);
        n++;
      }
    petals.count = n;
    petals.instanceMatrix.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    toneAttr.needsUpdate = true;
  }

  function draw() {
    if (lost || size.w === 0) return;
    if (stillDirty) {
      renderer.setRenderTarget(rt);
      renderer.render(still, camera);
      renderer.setRenderTarget(null);
      stillDirty = false;
    }
    renderer.render(overlay, camera);
    sceneStats.frames++;
    if (failed) throw new Error("scene shader failed");
    if (!sceneStats.ready) {
      sceneStats.ready = true;
      onReady(true);
    }
  }

  function stopLoop() {
    renderer.setAnimationLoop(null);
    looping = false;
    sceneStats.looping = false;
  }

  function tick(now: number) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    for (const b of bursts) b.t += dt;
    bursts = bursts.filter((b) => b.t * 1000 < b.ms);
    updatePetals();
    guard(draw);
    // The last frame is drawn with no petals, so the still is left clean.
    if (bursts.length === 0) stopLoop();
  }

  function startLoop() {
    if (looping || bursts.length === 0 || document.visibilityState === "hidden" || lost) return;
    looping = true;
    sceneStats.looping = true;
    last = performance.now();
    renderer.setAnimationLoop(tick);
  }

  function clearBursts() {
    bursts = [];
    petals.count = 0;
    if (looping) stopLoop();
  }

  function onRequest(r: SceneRequest) {
    if (!comp || reducedMotion().matches || sceneBus.get().mode !== "play" || lost) return;
    seed = (seed * 16807) % 2147483647;
    const view = { w: size.w, h: size.h };
    const fresh = r.kind === "gust" ? planGust(r.unit, r.board, view, seed) : planStorm(comp.sources, view, seed);
    bursts.push({ petals: fresh, t: 0, ms: burstMs(r.kind) });
    startLoop();
  }

  // --- render triggers ---
  function refresh(opts: { recompose?: boolean; colors?: boolean } = {}) {
    guard(() => {
      if (opts.colors || !palette) {
        const next = readPalette(getComputedStyle(document.documentElement));
        if (!palette || JSON.stringify(next) !== JSON.stringify(palette)) {
          palette = next;
          setColors(next);
          stillDirty = true;
        }
      }
      if (opts.recompose) recompose();
      // While petals fly, the loop draws the next frame anyway.
      if (stillDirty && !looping) draw();
    });
  }

  let disposed = false;
  function guard(fn: () => void) {
    try {
      fn();
    } catch {
      // Anything that goes wrong leaves the CSS fallback in place, silently.
      teardown();
    }
  }

  const ro = new ResizeObserver(() => {
    if (resize()) refresh({ recompose: true });
  });
  ro.observe(host);
  let boardEl: Element | null = null;
  const boardRo = new ResizeObserver(() => refresh({ recompose: true }));
  function watchBoard() {
    const el = document.querySelector(sceneBus.get().mode === "display" ? ".dboard" : ".board");
    if (el === boardEl) return;
    if (boardEl) boardRo.unobserve(boardEl);
    boardEl = el;
    if (el) boardRo.observe(el);
  }

  const themeMo = new MutationObserver(() => refresh({ colors: true }));
  themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const onScheme = () => refresh({ colors: true });
  darkScheme().addEventListener("change", onScheme);
  const onMotion = () => {
    if (reducedMotion().matches) {
      clearBursts();
      guard(draw);
    }
  };
  reducedMotion().addEventListener("change", onMotion);
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (looping) stopLoop();
    } else startLoop();
  };
  document.addEventListener("visibilitychange", onVisibility);

  let prev = sceneBus.get();
  const unsubscribe = sceneBus.subscribe(() => {
    const next = sceneBus.get();
    if (next.mode !== prev.mode) {
      clearBursts();
      applyDrift();
      // Display mounts its board in the same commit; measure once layout has settled.
      requestAnimationFrame(() => {
        watchBoard();
        refresh({ recompose: true });
      });
    } else if (next.drift !== prev.drift) {
      applyDrift();
      refresh();
    }
    prev = next;
  });
  const release = sceneBus.handle(onRequest);

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    clearBursts();
    sceneStats.ready = false;
    onReady(false);
  };
  const onRestored = () => {
    lost = false;
    stillDirty = true;
    guard(draw);
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  function teardown() {
    if (disposed) return;
    disposed = true;
    stopLoop();
    ro.disconnect();
    boardRo.disconnect();
    themeMo.disconnect();
    darkScheme().removeEventListener("change", onScheme);
    reducedMotion().removeEventListener("change", onMotion);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    unsubscribe();
    release();
    sceneStats.ready = false;
    onReady(false);
    branch?.geometry.dispose();
    flowers?.geometry.dispose();
    flowers?.dispose();
    for (const mat of [barkMat, hullMat, flowerMat, sky.material, present.material, petals.material]) mat.dispose();
    quad.dispose();
    petalGeo.dispose();
    petals.dispose();
    rt.dispose();
    renderer.dispose();
    canvas.remove();
  }

  guard(() => {
    applyDrift();
    watchBoard();
    if (resize()) refresh({ colors: true, recompose: true });
  });
  return teardown;
}
