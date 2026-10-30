import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getPlayback, getProduct, sendControl, SpotifyError, type Control, type NowPlaying } from "./api";
import { loadTokens, subscribeTokens } from "./auth";

// Spotify has no push channel for playback, so poll. Five seconds keeps track changes prompt and is
// far inside the rate limit for one listener; progress between polls is interpolated locally.
export const POLL_MS = 5000;

export type Status = "disconnected" | "loading" | "idle" | "ready" | "error";
export type Notice = "premium" | "noDevice" | "failed" | null;

export interface NowPlayingState {
  status: Status;
  np: NowPlaying | null;
  fetchedAt: number;
  notice: Notice;
  /** False only when Spotify says the account isn't Premium. */
  canControl: boolean;
  control: (a: Control) => void;
}

export function noticeFor(e: unknown): Notice {
  if (!(e instanceof SpotifyError)) return "failed";
  if (e.status === 403) return "premium";
  if (e.status === 404) return "noDevice";
  return "failed";
}

/** Polls while `active` (Display visible and the card switched on) and a sign-in exists. */
export function useNowPlaying(clientId: string, active: boolean): NowPlayingState {
  const connected = useSyncExternalStore(subscribeTokens, () => loadTokens() !== null, () => false);
  const [np, setNp] = useState<NowPlaying | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [notice, setNotice] = useState<Notice>(null);
  const [product, setProduct] = useState<string | null>(null);
  const live = connected && active && clientId !== "";

  const poll = useCallback(async () => {
    try {
      const next = await getPlayback(clientId);
      setNp(next);
      setFetchedAt(Date.now());
      setStatus(next ? "ready" : "idle");
    } catch (e) {
      // A lost sign-in shows as disconnected through the token store; anything else is transient.
      if (!(e instanceof SpotifyError && e.status === 401)) setStatus("error");
    }
  }, [clientId]);

  useEffect(() => {
    if (!live) return;
    // First poll from a timer, like the rest, so state only changes in callbacks.
    const first = window.setTimeout(() => {
      void poll();
      getProduct(clientId).then(setProduct, () => setProduct(null));
    }, 0);
    const every = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [live, poll, clientId]);

  const control = useCallback(
    (a: Control) => {
      setNotice(null);
      // Show the new play state at once; the follow-up poll corrects it if Spotify disagrees.
      if (a === "play" || a === "pause") setNp((cur) => (cur ? { ...cur, isPlaying: a === "play" } : cur));
      sendControl(clientId, a).then(
        () => window.setTimeout(() => void poll(), 400),
        (e: unknown) => {
          setNotice(noticeFor(e));
          void poll();
        },
      );
    },
    [clientId, poll],
  );

  const canControl = product === null || product === "premium";
  return { status: connected ? status : "disconnected", np, fetchedAt, notice, canControl, control };
}
