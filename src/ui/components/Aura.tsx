import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** The flare reaches this many board widths across, so the glow clears the board's edges. */
const SPREAD = 2.3;

/**
 * The solved aura: a flame-like glow around the board, about two seconds, then it removes itself.
 * It is portaled to the body as a fixed layer behind the app, so the glow can bleed past the
 * board without ever adding scroll height to the app. Purely decorative: no role, no focus, and
 * the CSS keeps it to transform and opacity (and to a plain fade under reduced motion).
 */
export function Aura({ onDone }: { onDone: () => void }) {
  const layer = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });
  // Measure the board before the first paint; the layer then needs no JS while it plays.
  useLayoutEffect(() => {
    const board = document.querySelector(".board");
    const el = layer.current;
    if (!board || !el) {
      done.current();
      return;
    }
    const r = board.getBoundingClientRect();
    el.style.setProperty("--aura-x", `${r.left + r.width / 2}px`);
    el.style.setProperty("--aura-y", `${r.top + r.height / 2}px`);
    el.style.setProperty("--aura-d", `${Math.max(r.width, r.height) * SPREAD}px`);
  }, []);
  // The animation's end removes the layer; this is the backstop if it never runs.
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), 2600);
    return () => window.clearTimeout(t);
  }, []);
  return createPortal(
    <div ref={layer} className="aura" aria-hidden="true">
      <div className="aura-core">
        <div className="aura-layer aura-halo" />
        <div className="aura-layer aura-tongues" onAnimationEnd={() => done.current()} />
        <div className="aura-layer aura-tongues aura-tongues--b" />
      </div>
    </div>,
    document.body,
  );
}
