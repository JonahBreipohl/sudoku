// Spotify sign-in with Authorization Code + PKCE, the flow Spotify supports for apps with no
// backend: the client ID is public and no secret is involved. Tokens live in localStorage under
// their own key (not in settings) and are only ever sent to Spotify.

// user-read-private reveals the account type, so free accounts get disabled controls instead of 403s.
export const SCOPES = ["user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing", "user-read-private"];
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TOKENS_KEY = "sudoku:v1:spotify-tokens";
// The verifier and state must survive the round trip to Spotify, but only for this tab.
const PENDING_KEY = "sudoku:v1:spotify-pending";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

interface Pending {
  verifier: string;
  state: string;
  /** Where to land after the redirect, e.g. "?mode=display". */
  returnSearch: string;
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(byteLength = 48): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** RFC 7636 S256: base64url(SHA-256(verifier)). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/**
 * The page itself, without query or hash. It must match a Redirect URI in the Spotify app exactly.
 * Spotify rejects "localhost"; local development has to use http://127.0.0.1:<port>/.
 */
export function redirectUriFor(loc: Pick<Location, "origin" | "pathname">): string {
  return loc.origin + loc.pathname;
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    scope: SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: p.challenge,
    redirect_uri: p.redirectUri,
    state: p.state,
  });
  return `${AUTHORIZE_URL}?${q}`;
}

/** Sends the browser to Spotify's consent page. */
export async function beginLogin(clientId: string, returnSearch: string): Promise<void> {
  const verifier = randomString();
  const state = randomString(16);
  const pending: Pending = { verifier, state, returnSearch };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const challenge = await challengeFor(verifier);
  window.location.assign(authorizeUrl({ clientId, redirectUri: redirectUriFor(window.location), challenge, state }));
}

export type Callback = { kind: "none" } | { kind: "code"; code: string; state: string } | { kind: "error"; error: string; state: string };

export function parseCallback(search: string): Callback {
  const p = new URLSearchParams(search);
  const state = p.get("state");
  if (state === null) return { kind: "none" };
  const code = p.get("code");
  if (code) return { kind: "code", code, state };
  const error = p.get("error");
  return error ? { kind: "error", error, state } : { kind: "none" };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export function tokensFrom(json: TokenResponse, now: number, previousRefresh = ""): Tokens {
  return {
    accessToken: json.access_token,
    // A refresh may omit refresh_token, in which case the old one stays valid.
    refreshToken: json.refresh_token ?? previousRefresh,
    // Renew a minute early so a request never races the expiry.
    expiresAt: now + (json.expires_in - 60) * 1000,
  };
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);
  return (await res.json()) as TokenResponse;
}

/**
 * Finishes a redirect back from Spotify, if this page load is one. It rewrites the URL first and
 * synchronously (dropping code and state, restoring the pre-login query) so mode parsing sees the
 * intended URL, then exchanges the code in the background.
 */
export function completeLoginFromUrl(clientId: string): Promise<boolean> {
  const cb = parseCallback(window.location.search);
  if (cb.kind === "none") return Promise.resolve(false);
  let pending: Pending | null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as Pending | null;
  } catch {
    pending = null;
  }
  sessionStorage.removeItem(PENDING_KEY);
  window.history.replaceState(null, "", window.location.pathname + (pending?.returnSearch ?? "") + window.location.hash);
  if (cb.kind !== "code" || !pending || pending.state !== cb.state || !clientId) return Promise.resolve(false);
  return postToken({
    grant_type: "authorization_code",
    code: cb.code,
    redirect_uri: redirectUriFor(window.location),
    client_id: clientId,
    code_verifier: pending.verifier,
  }).then(
    (json) => {
      saveTokens(tokensFrom(json, Date.now()));
      return true;
    },
    () => false,
  );
}

// Spotify may rotate the refresh token on use, so two overlapping refreshes (a poll and a button
// press right at expiry) would spend the same token twice and the second would sign the owner out.
let inFlight: Promise<Tokens> | null = null;

export function refresh(clientId: string, tokens: Tokens): Promise<Tokens> {
  inFlight ??= postToken({ grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: clientId })
    .then((json) => {
      const next = tokensFrom(json, Date.now(), tokens.refreshToken);
      saveTokens(next);
      return next;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// A tiny store so the card re-renders when sign-in completes or the owner disconnects.
const listeners = new Set<() => void>();
let cached: Tokens | null | undefined;

export function loadTokens(): Tokens | null {
  if (cached !== undefined) return cached;
  try {
    const t = JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "null") as Tokens | null;
    cached = t && typeof t.accessToken === "string" && typeof t.refreshToken === "string" && typeof t.expiresAt === "number" ? t : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function saveTokens(t: Tokens | null): void {
  cached = t;
  try {
    if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKENS_KEY);
  } catch {
    // Blocked storage: the session still works until reload.
  }
  listeners.forEach((l) => l());
}

export function subscribeTokens(l: () => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}
