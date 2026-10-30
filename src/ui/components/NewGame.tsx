import { useEffect, useRef, useState } from "react";
import type { Level } from "../../engine/step";
import { ConfirmDialog } from "./ConfirmDialog";
import { NewGameDialog, levelLabel } from "./NewGameDialog";
import { common, newGame as t } from "../strings";

interface NewGameProps {
  pending: boolean;
  /** The current game has player work that a new game would discard. */
  inProgress: boolean;
  onNewGame: (level: Level) => void;
  onDaily: () => void;
  /** Evaluated when the picker opens, so it reflects solves since the last render. */
  isDailySolved?: () => boolean;
}

export function NewGame({ pending, inProgress, onNewGame, onDaily, isDailySolved }: NewGameProps) {
  const [choosing, setChoosing] = useState(false);
  const [confirm, setConfirm] = useState<Level | "daily" | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const open = choosing || confirm !== null;

  // The modal dialog keeps the page inert until it is unmounted, so focus can only go back after.
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <div className="new-game" role="group" aria-label={t.group}>
      {/* aria-disabled rather than disabled, so focus stays on the button while generating. */}
      <button
        ref={button}
        data-new-game
        type="button"
        className="ctl"
        aria-disabled={pending}
        aria-busy={pending}
        aria-haspopup="dialog"
        onClick={() => {
          if (!pending) setChoosing(true);
        }}
      >
        {t.button}
      </button>
      <span role="status" className="new-game-status">
        {pending ? <><span aria-hidden="true">⏳ </span>{t.generating}</> : ""}
      </span>
      {choosing && (
        <NewGameDialog
          onCancel={() => setChoosing(false)}
          dailySolved={isDailySolved?.() ?? false}
          onDaily={() => {
            setChoosing(false);
            if (inProgress) setConfirm("daily");
            else onDaily();
          }}
          onStart={(level) => {
            setChoosing(false);
            if (inProgress) setConfirm(level);
            else onNewGame(level);
          }}
        />
      )}
      {confirm !== null && (
        <ConfirmDialog
          title={t.abandonTitle}
          message={t.abandonMessage(confirm === "daily" ? t.dailyTarget : t.newLevelTarget(levelLabel(confirm)))}
          confirmLabel={t.abandonConfirm}
          cancelLabel={common.keepPlaying}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const level = confirm;
            setConfirm(null);
            if (level === "daily") onDaily();
            else onNewGame(level);
          }}
        />
      )}
    </div>
  );
}
