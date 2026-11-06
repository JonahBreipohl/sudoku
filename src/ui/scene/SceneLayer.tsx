import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sceneBus } from "./bus";
import { along, rng, type Pt } from "./geom";
import "./scene.css";

/** One five-petal flower of radius 1 as an SVG path: notched petals around the centre. */
function flowerPath(): string {
  const petal: [number, number][] = [[0.35, -0.44], [0.86, -0.4], [1, -0.13], [0.84, 0], [1, 0.13], [0.86, 0.4], [0.35, 0.44]];
  const f = (n: number) => n.toFixed(3);
  let d = "";
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5 - Math.PI / 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const p = petal.map(([x, y]) => `${f(x * c - y * s)} ${f(x * s + y * c)}`);
    d += `M0 0C${p[0]} ${p[1]} ${p[2]}L${p[3]}L${p[4]}C${p[5]} ${p[6]} 0 0Z`;
  }
  return d;
}
const FLOWER = flowerPath();

/** The fallback branch on its 600 x 420 drawing: [polyline, ink width, bark width]. */
const LIMBS: [Pt[], number, number][] = [
  [[[-30, 40], [120, 72], [260, 138], [400, 186], [560, 250]], 26, 20],
  [[[120, 80], [105, 160], [70, 240]], 12, 7],
  [[[280, 145], [330, 95], [360, 62]], 9, 4.5],
  [[[420, 190], [450, 225], [470, 238]], 7, 3],
];
/** A smooth path through the points (Catmull-Rom as cubic Béziers), so twigs bend, not kink. */
function toPath(pts: Pt[]): string {
  const p = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  let d = `M${p(0)[0]} ${p(0)[1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b, c, e] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C${c1.map((v) => v.toFixed(1)).join(" ")} ${c2.map((v) => v.toFixed(1)).join(" ")} ${c[0]} ${c[1]}`;
  }
  return d;
}

/** Seeded clusters hanging under the twigs, like the 3D composition's: [x, y, radius]. */
const FLOWERS: [number, number, number][] = (() => {
  const rand = rng(11);
  const out: [number, number, number][] = [];
  LIMBS.forEach(([pts], li) => {
    for (let f = li === 0 ? 0.3 : 0.35; f <= 1; f += li === 0 ? 0.11 : 0.28) {
      const [cx, cy] = along(pts, f);
      for (let i = 0, n = 3 + Math.floor(rand() * 3); i < n; i++) {
        const a = rand() * Math.PI * 2;
        const d = 8 + rand() * 20;
        out.push([cx + Math.cos(a) * d, cy + Math.abs(Math.sin(a)) * d + 4, 13 + rand() * 8]);
      }
    }
  });
  return out;
})();

/** A cumulus bank's lobe tops along the bottom edge (1200 x 160, stretched to the width). */
const BANK = "M0 160V78C30 40 92 40 118 70C140 22 232 16 262 62C290 40 340 44 356 70C384 18 486 12 512 66C540 46 592 48 606 74C640 28 734 26 760 70C790 50 836 52 852 78C880 30 972 22 1004 68C1030 44 1084 46 1100 72C1128 40 1180 42 1200 64V160Z";

function whenIdle(fn: () => void): () => void {
  let timer = 0;
  let idle = 0;
  const go = () => {
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(fn, { timeout: 1500 });
    else timer = window.setTimeout(fn, 300);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
  return () => {
    window.removeEventListener("load", go);
    if (idle) window.cancelIdleCallback(idle);
    window.clearTimeout(timer);
  };
}

function canTry(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !conn?.saveData && typeof WebGL2RenderingContext !== "undefined";
}

/**
 * WebGL2 on a real GPU. A software rasterizer (SwiftShader, llvmpipe) draws the full-screen sky on
 * the CPU and stalls the page for a second or more, so those keep the CSS still instead.
 * `?scene=webgl` forces the scene anyway (docs/ARCHITECTURE.md, "Testing hooks").
 */
function hardwareGl(): boolean {
  if (new URLSearchParams(window.location.search).get("scene") === "webgl") return true;
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return false;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

/**
 * The Hanami world behind the app: a CSS sky and SVG branch paint first; the three.js scene loads
 * once the board is interactive and crossfades in over it. Decorative only, never focusable.
 */
export function SceneLayer() {
  const host = useRef<HTMLDivElement>(null);
  const { mode, dim } = useSyncExternalStore(sceneBus.subscribe, sceneBus.get, sceneBus.get);
  const [ready, setReady] = useState(false);
  // Night dimming fades slowly while Display is up, but entering Display at night starts dim.
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = layer.current;
    if (!el || mode !== "display") return;
    const id = requestAnimationFrame(() => (el.dataset.fade = ""));
    return () => {
      cancelAnimationFrame(id);
      delete el.dataset.fade;
    };
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scene = "";
    let stop: (() => void) | undefined;
    let cancelled = false;
    const cancelIdle = canTry()
      ? whenIdle(() => {
          if (cancelled || !hardwareGl()) return;
          import("./runtime").then(
            (m) => {
              if (cancelled || !host.current) return;
              try {
                stop = m.startScene(host.current, setReady);
              } catch {
                setReady(false); // no WebGL after all: the fallback stays
              }
            },
            () => {},
          );
        })
      : () => {};
    return () => {
      cancelled = true;
      cancelIdle();
      stop?.();
      delete root.dataset.scene;
    };
  }, []);

  return (
    <div ref={layer} className="scene" aria-hidden="true" data-mode={mode} data-dim={dim ? "" : undefined} data-ready={ready ? "" : undefined}>
      <div className="scene-fallback">
        <svg viewBox="0 0 600 420" focusable="false">
          <defs>
            <symbol id="scene-flower" viewBox="-1.15 -1.15 2.3 2.3">
              <path d={FLOWER} className="scene-fb-petal" />
              <circle r="0.36" className="scene-fb-heart" />
              <circle r="0.12" className="scene-fb-eye" />
            </symbol>
          </defs>
          <g className="scene-fb-branch">
            {LIMBS.map(([pts, ink], i) => (
              <path key={i} d={toPath(pts)} strokeWidth={ink} />
            ))}
          </g>
          <g className="scene-fb-bark">
            {LIMBS.map(([pts, , bark], i) => (
              <path key={i} d={toPath(pts)} strokeWidth={bark} />
            ))}
          </g>
          {FLOWERS.map(([x, y, r], i) => (
            <use key={i} href="#scene-flower" x={x - r * 1.15} y={y - r * 1.15} width={r * 2.3} height={r * 2.3} />
          ))}
        </svg>
        <svg className="scene-fb-bank" viewBox="0 0 1200 160" preserveAspectRatio="none" focusable="false">
          <path d={BANK} />
        </svg>
      </div>
      <div className="scene-canvas" ref={host} />
    </div>
  );
}
