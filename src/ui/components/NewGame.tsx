import { useEffect, useRef, useState } from "react";
import { LEVELS, type Level } from "../../engine/step";
import { ConfirmDialog } from "./ConfirmDialog";

interface NewGameProps {
  pending: boolean;
  /** The current game has player work that a new game would discard. */
  inProgress: boolean;
  onNewGame: (level: Level) => void;
}

const label = (l: Level) => l[0]!.toUpperCase() + l.slice(1);

export function NewGame({ pending, inProgress, onNewGame }: NewGameProps) {
  const [level, setLevel] = useState<Level>("easy");
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // The modal dialog keeps the page inert until it is unmounted, so focus can only go back after.
  useEffect(() => {
    if (wasConfirming.current && !confirming) button.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  return (
    <div className="new-game" role="group" aria-label="New game">
      <label>
        <span className="sr-only">Difficulty</span>
        <select className="ctl" value={level} disabled={pending} onChange={(e) => setLevel(e.target.value as Level)}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {label(l)}
            </option>
          ))}
        </select>
      </label>
      {/* aria-disabled rather than disabled, so focus stays on the button while generating. */}
      <button
        ref={button}
        type="button"
        className="ctl"
        aria-disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (pending) return;
          if (inProgress) setConfirming(true);
          else onNewGame(level);
        }}
      >
        New game
      </button>
      <span role="status" className="new-game-status">
        {pending ? <><span aria-hidden="true">⏳ </span>Generating…</> : ""}
      </span>
      {confirming && (
        <ConfirmDialog
          title="Abandon this game?"
          message={`Starting a new ${label(level)} game discards your progress on this puzzle. It is not saved or counted in your stats.`}
          confirmLabel="Abandon and start new"
          cancelLabel="Keep playing"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onNewGame(level);
          }}
        />
      )}
    </div>
  );
}
