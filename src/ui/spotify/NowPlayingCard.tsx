import { beginLogin } from "./auth";
import { formatMs, progressAt } from "./api";
import { useNowPlaying } from "./useNowPlaying";
import { spotify as t } from "../strings";

/**
 * Display mode's Spotify card: cover, title, artist, a progress bar and transport controls.
 * `now` is Display's once-a-second tick, which also drives the progress interpolation, so the card
 * adds no timers of its own beyond the poll.
 */
export function NowPlayingCard({ clientId, now, active }: { clientId: string; now: number; active: boolean }) {
  const { status, np, fetchedAt, notice, canControl, control } = useNowPlaying(clientId, active);

  let body: React.ReactNode;
  if (!clientId) body = <p className="np-message">{t.needsClientId}</p>;
  else if (status === "disconnected")
    body = (
      <button type="button" className="ctl" onClick={() => void beginLogin(clientId, window.location.search)}>
        {t.connect}
      </button>
    );
  else if (status === "loading") body = <p className="np-message">{t.loading}</p>;
  else if (status === "error" && !np) body = <p className="np-message">{t.error}</p>;
  else if (!np) body = <p className="np-message">{t.idle}</p>;
  else {
    const progress = progressAt(np, fetchedAt, now);
    const pct = np.durationMs ? (progress / np.durationMs) * 100 : 0;
    body = (
      <>
        {np.artUrl ? <img className="np-art" src={np.artUrl} alt="" width={300} height={300} /> : <div className="np-art np-art-empty" aria-hidden="true">♪</div>}
        <div className="np-meta">
          <p className="np-title">{np.title}</p>
          <p className="np-artist">{np.artists}</p>
          {np.album && <p className="np-album">{np.album}</p>}
          <div
            className="np-bar"
            role="progressbar"
            aria-label={t.progress}
            aria-valuemin={0}
            aria-valuemax={Math.round(np.durationMs / 1000)}
            aria-valuenow={Math.round(progress / 1000)}
            aria-valuetext={`${formatMs(progress)} ${t.of} ${formatMs(np.durationMs)}`}
          >
            <div className="np-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="np-times" aria-hidden="true">
            <span>{formatMs(progress)}</span>
            <span>{formatMs(np.durationMs)}</span>
          </p>
          <div className="np-controls">
            <button type="button" className="ctl np-btn" aria-label={t.previous} disabled={!canControl} onClick={() => control("previous")}>
              <span aria-hidden="true">⏮</span>
            </button>
            <button
              type="button"
              className="ctl np-btn np-play"
              aria-label={np.isPlaying ? t.pause : t.play}
              disabled={!canControl}
              onClick={() => control(np.isPlaying ? "pause" : "play")}
            >
              <span aria-hidden="true">{np.isPlaying ? "❚❚" : "▶"}</span>
            </button>
            <button type="button" className="ctl np-btn" aria-label={t.next} disabled={!canControl} onClick={() => control("next")}>
              <span aria-hidden="true">⏭</span>
            </button>
          </div>
          {np.device && <p className="np-device">{t.onDevice(np.device)}</p>}
        </div>
      </>
    );
  }

  return (
    <section className="np" aria-label={t.label}>
      {body}
      <p className="np-notice" role="status">
        {notice ? t.notices[notice] : np && !canControl ? t.notices.premium : ""}
      </p>
    </section>
  );
}
