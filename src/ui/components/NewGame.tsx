import { useState } from "react";
import { LEVELS, type Level } from "../../engine/step";

interface NewGameProps {
  pending: boolean;
  onNewGame: (level: Level) => void;
}

export function NewGame({ pending, onNewGame }: NewGameProps) {
  const [level, setLevel] = useState<Level>("easy");
  return (
    <div className="new-game" role="group" aria-label="New game">
      <label>
        <span className="sr-only">Difficulty</span>
        <select className="ctl" value={level} disabled={pending} onChange={(e) => setLevel(e.target.value as Level)}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l[0]!.toUpperCase() + l.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="ctl" disabled={pending} aria-busy={pending} onClick={() => onNewGame(level)}>
        New game
      </button>
      <span role="status" className="new-game-status">
        {pending ? <><span aria-hidden="true">⏳ </span>Generating…</> : ""}
      </span>
    </div>
  );
}
