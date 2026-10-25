import { useEffect, useRef } from "react";

/** Stands in for the board while paused, so no cell content is in the DOM or a11y tree. */
export function PauseOverlay({ onResume }: { onResume: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="pause-overlay" role="region" aria-label="Game paused">
      <p className="pause-title">
        <span aria-hidden="true">❚❚</span> Paused
      </p>
      <button ref={ref} type="button" className="ctl pause-resume" onClick={onResume} aria-keyshortcuts="P Enter">
        Resume
      </button>
    </div>
  );
}
