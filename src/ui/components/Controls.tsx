interface ControlsProps {
  notesMode: boolean;
  /** True while Shift is held, which acts as notes mode without changing the toggle. */
  shiftHeld: boolean;
  autoCandidates: boolean;
  onToggleNotes: () => void;
  onAutoNotes: () => void;
  onToggleAuto: () => void;
}

export function Controls({
  notesMode,
  shiftHeld,
  autoCandidates,
  onToggleNotes,
  onAutoNotes,
  onToggleAuto,
}: ControlsProps) {
  const active = notesMode || shiftHeld;
  return (
    <div className="controls" role="group" aria-label="Notes">
      <button
        type="button"
        className={active ? "ctl ctl--on" : "ctl"}
        aria-pressed={notesMode}
        onClick={onToggleNotes}
        aria-keyshortcuts="N"
      >
        <span aria-hidden="true">{active ? "✎" : "○"}</span> Notes: {active ? "On" : "Off"}
        {shiftHeld && !notesMode ? " (Shift)" : ""}
      </button>
      <button type="button" className="ctl" onClick={onAutoNotes}>
        Fill notes
      </button>
      <button type="button" className={autoCandidates ? "ctl ctl--on" : "ctl"} aria-pressed={autoCandidates} onClick={onToggleAuto}>
        <span aria-hidden="true">{autoCandidates ? "☑" : "☐"}</span> Auto-candidates: {autoCandidates ? "On" : "Off"}
      </button>
    </div>
  );
}
