import { describe, expect, it } from "vitest";
import { authorizeUrl, challengeFor, parseCallback, randomString, redirectUriFor, SCOPES, tokensFrom } from "./auth";

describe("PKCE", () => {
  it("derives the RFC 7636 example challenge", async () => {
    expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes URL-safe verifiers within the 43-128 character limit", () => {
    const v = randomString();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(randomString()).not.toBe(v);
  });
});

describe("authorizeUrl", () => {
  it("asks for the playback scopes with S256 and echoes the redirect and state", () => {
    const url = new URL(authorizeUrl({ clientId: "a".repeat(32), redirectUri: "https://x.test/sudoku/", challenge: "ch", state: "st" }));
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    const q = url.searchParams;
    expect(q.get("response_type")).toBe("code");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("code_challenge")).toBe("ch");
    expect(q.get("redirect_uri")).toBe("https://x.test/sudoku/");
    expect(q.get("state")).toBe("st");
    expect(q.get("scope")!.split(" ")).toEqual(SCOPES);
  });

  it("uses the page without its query as the redirect URI", () => {
    expect(redirectUriFor({ origin: "http://127.0.0.1:5173", pathname: "/" })).toBe("http://127.0.0.1:5173/");
  });
});

describe("parseCallback", () => {
  it("ignores ordinary page loads", () => {
    expect(parseCallback("?mode=display")).toEqual({ kind: "none" });
    expect(parseCallback("?code=abc")).toEqual({ kind: "none" });
  });
  it("reads a code or an error with its state", () => {
    expect(parseCallback("?code=abc&state=s1")).toEqual({ kind: "code", code: "abc", state: "s1" });
    expect(parseCallback("?error=access_denied&state=s1")).toEqual({ kind: "error", error: "access_denied", state: "s1" });
  });
});

describe("tokensFrom", () => {
  it("expires a minute early and keeps the old refresh token when none is returned", () => {
    expect(tokensFrom({ access_token: "a", expires_in: 3600 }, 1000, "r0")).toEqual({
      accessToken: "a",
      refreshToken: "r0",
      expiresAt: 1000 + 3540_000,
    });
    expect(tokensFrom({ access_token: "a", refresh_token: "r1", expires_in: 3600 }, 0, "r0").refreshToken).toBe("r1");
  });
});
