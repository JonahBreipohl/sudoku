import { useEffect, useRef } from "react";
import { pause as t } from "../strings";

/** Stands in for the board while paused, so no cell content is in the DOM or a11y tree. */
export function PauseOverlay({ onResume }: { onResume: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="pause-overlay" role="region" aria-label={t.region}>
      <p className="pause-title">
        <span aria-hidden="true">❚❚</span> {t.title}
      </p>
      <button ref={ref} type="button" className="ctl pause-resume" onClick={onResume} aria-keyshortcuts="P Enter">
        {t.resume}
      </button>
    </div>
  );
}
