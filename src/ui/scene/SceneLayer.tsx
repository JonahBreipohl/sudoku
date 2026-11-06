import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sceneBus } from "./bus";
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

/** Where the fallback's flowers sit on its 600 x 420 branch drawing: [x, y, radius]. */
const FLOWERS: [number, number, number][] = [
  [150, 92, 17], [182, 112, 14], [128, 120, 13], [262, 132, 18], [298, 150, 15], [236, 160, 13],
  [372, 168, 17], [404, 190, 14], [350, 200, 12], [470, 206, 16], [500, 226, 13], [92, 186, 15],
  [118, 222, 13], [70, 238, 12], [330, 92, 14], [356, 66, 12], [532, 250, 11], [440, 236, 12],
];

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
            <path d="M-30 40C80 70 160 100 260 140S440 200 560 250" strokeWidth="26" />
            <path d="M120 80C110 140 100 190 70 240" strokeWidth="12" />
            <path d="M280 145C300 110 330 80 360 62" strokeWidth="9" />
            <path d="M420 190C440 215 450 232 470 238" strokeWidth="7" />
          </g>
          <g className="scene-fb-bark">
            <path d="M-30 40C80 70 160 100 260 140S440 200 560 250" strokeWidth="20" />
            <path d="M120 80C110 140 100 190 70 240" strokeWidth="7" />
            <path d="M280 145C300 110 330 80 360 62" strokeWidth="4.5" />
            <path d="M420 190C440 215 450 232 470 238" strokeWidth="3" />
          </g>
          {FLOWERS.map(([x, y, r], i) => (
            <use key={i} href="#scene-flower" x={x - r * 1.15} y={y - r * 1.15} width={r * 2.3} height={r * 2.3} />
          ))}
        </svg>
      </div>
      <div className="scene-canvas" ref={host} />
    </div>
  );
}
