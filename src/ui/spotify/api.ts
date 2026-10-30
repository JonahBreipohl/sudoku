// Spotify Web API playback calls. Reading works on any account; play/pause/skip need Premium,
// and Spotify answers 403 without it.

import { loadTokens, refresh, saveTokens, type Tokens } from "./auth";

const API = "https://api.spotify.com/v1/me";

export interface NowPlaying {
  isPlaying: boolean;
  title: string;
  artists: string;
  album: string;
  artUrl: string | null;
  progressMs: number;
  durationMs: number;
  device: string | null;
}

export type Control = "play" | "pause" | "next" | "previous";

interface Image {
  url: string;
  width?: number | null;
}
interface PlaybackJson {
  is_playing?: boolean;
  progress_ms?: number | null;
  device?: { name?: string } | null;
  item?: {
    name?: string;
    duration_ms?: number;
    artists?: { name: string }[];
    album?: { name?: string; images?: Image[] };
    // Podcast episodes carry show and images instead of artists and album.
    show?: { name?: string; publisher?: string };
    images?: Image[];
  } | null;
}

/** The smallest image at least `min` px wide, else the largest: the card shows art at about 300 px. */
export function pickImage(images: Image[] | undefined, min = 280): string | null {
  if (!images?.length) return null;
  const sized = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sized.find((i) => (i.width ?? 0) >= min) ?? sized[sized.length - 1])!.url;
}

/** Null when nothing is loaded (204, no item, or an ad). */
export function parsePlayback(json: PlaybackJson | null): NowPlaying | null {
  const item = json?.item;
  if (!json || !item || !item.name) return null;
  const artists = item.artists?.map((a) => a.name).join(", ") || item.show?.publisher || "";
  return {
    isPlaying: json.is_playing === true,
    title: item.name,
    artists,
    album: item.album?.name ?? item.show?.name ?? "",
    artUrl: pickImage(item.album?.images ?? item.images),
    progressMs: Math.max(0, json.progress_ms ?? 0),
    durationMs: Math.max(0, item.duration_ms ?? 0),
    device: json.device?.name ?? null,
  };
}

/** Progress now, given a snapshot fetched at `fetchedAt`; playing tracks advance, capped at the end. */
export function progressAt(np: NowPlaying, fetchedAt: number, now: number): number {
  const p = np.isPlaying ? np.progressMs + Math.max(0, now - fetchedAt) : np.progressMs;
  return Math.min(p, np.durationMs);
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export class SpotifyError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Spotify ${status} ${reason}`);
  }
}

async function validTokens(clientId: string): Promise<Tokens> {
  const t = loadTokens();
  if (!t) throw new SpotifyError(401, "NOT_CONNECTED");
  return t.expiresAt > Date.now() ? t : refresh(clientId, t);
}

/** One authorized request, refreshing once on 401. A failed refresh signs out. */
async function call(clientId: string, method: string, path: string): Promise<Response> {
  let tokens = await validTokens(clientId).catch((e: unknown) => {
    if (!(e instanceof SpotifyError)) saveTokens(null);
    throw e instanceof SpotifyError ? e : new SpotifyError(401, "REFRESH_FAILED");
  });
  const send = (t: Tokens) => fetch(API + path, { method, headers: { Authorization: `Bearer ${t.accessToken}` } });
  let res = await send(tokens);
  if (res.status === 401) {
    try {
      tokens = await refresh(clientId, tokens);
    } catch {
      saveTokens(null);
      throw new SpotifyError(401, "REFRESH_FAILED");
    }
    res = await send(tokens);
  }
  if (!res.ok) {
    let reason = "";
    try {
      reason = ((await res.json()) as { error?: { reason?: string } }).error?.reason ?? "";
    } catch {
      // Empty or non-JSON error body.
    }
    throw new SpotifyError(res.status, reason);
  }
  return res;
}

export async function getPlayback(clientId: string): Promise<NowPlaying | null> {
  const res = await call(clientId, "GET", "/player?additional_types=episode");
  if (res.status === 204) return null;
  return parsePlayback((await res.json()) as PlaybackJson);
}

/** "premium", "free", or null when Spotify doesn't say (a sign-in from before the scope existed). */
export async function getProduct(clientId: string): Promise<string | null> {
  const res = await call(clientId, "GET", "");
  return ((await res.json()) as { product?: string }).product ?? null;
}

const CONTROL: Record<Control, [string, string]> = {
  play: ["PUT", "/player/play"],
  pause: ["PUT", "/player/pause"],
  next: ["POST", "/player/next"],
  previous: ["POST", "/player/previous"],
};

export async function sendControl(clientId: string, action: Control): Promise<void> {
  const [method, path] = CONTROL[action];
  await call(clientId, method, path);
}
