import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test, clickHeaderAction } from "./fixtures";

const CLIENT_ID = "0123456789abcdef0123456789abcdef";
// 1x1 transparent PNG for the album cover.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

function playback(isPlaying: boolean) {
  return {
    is_playing: isPlaying,
    progress_ms: 61_000,
    device: { name: "Desk speaker" },
    item: {
      name: "Test Song",
      duration_ms: 200_000,
      artists: [{ name: "Test Artist" }],
      album: { name: "Test Album", images: [{ url: "https://i.scdn.co/image/test", width: 300 }] },
    },
  };
}

/** Signed in, card on, Spotify mocked. Returns the control requests the page sends. */
async function mockSpotify(page: Page, { premium = true } = {}) {
  await page.addInitScript((clientId) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("sudoku:v1:settings", JSON.stringify({ nowPlaying: true, spotifyClientId: clientId }));
    localStorage.setItem(
      "sudoku:v1:spotify-tokens",
      JSON.stringify({ accessToken: "at", refreshToken: "rt", expiresAt: Date.now() + 3_600_000 }),
    );
  }, CLIENT_ID);
  let playing = true;
  const controls: string[] = [];
  await page.route("https://i.scdn.co/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("https://api.spotify.com/v1/me", (r) => r.fulfill({ json: { product: premium ? "premium" : "free" } }));
  await page.route("https://api.spotify.com/v1/me/player**", async (r) => {
    const req = r.request();
    expect(req.headers().authorization).toBe("Bearer at");
    if (req.method() === "GET") return r.fulfill({ json: playback(playing) });
    const action = new URL(req.url()).pathname.split("/").pop()!;
    controls.push(action);
    if (!premium) return r.fulfill({ status: 403, json: { error: { status: 403, reason: "PREMIUM_REQUIRED" } } });
    if (action === "pause") playing = false;
    if (action === "play") playing = true;
    return r.fulfill({ status: 204 });
  });
  return controls;
}

test("theme switch flips light and dark, persists, and works in Display", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Dark mode" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/?mode=display");
  const displayToggle = page.getByRole("button", { name: "Dark mode" });
  await displayToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(displayToggle).toHaveAttribute("aria-pressed", "false");
});

for (const scheme of ["light", "dark"] as const) {
  test(`Spotify card shows the track and controls playback (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const controls = await mockSpotify(page);
    await page.goto("/?mode=display");
    const card = page.getByRole("region", { name: "Now playing on Spotify" });
    await expect(card.getByText("Test Song")).toBeVisible();
    await expect(card.getByText("Test Artist")).toBeVisible();
    // The compact portrait card drops the album line to leave room for the board.
    const portrait = page.viewportSize()!.height > page.viewportSize()!.width;
    await expect(card.getByText("Test Album")).toBeVisible({ visible: !portrait });
    await expect(card.locator("img.np-art")).toHaveAttribute("src", "https://i.scdn.co/image/test");
    const bar = card.getByRole("progressbar", { name: "Track progress" });
    await expect(bar).toHaveAttribute("aria-valuemax", "200");
    // Interpolated between polls: it moves on with the clock.
    const start = Number(await bar.getAttribute("aria-valuenow"));
    await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow")), { timeout: 4000 }).toBeGreaterThan(start);

    for (const name of ["Previous track", "Pause", "Next track"]) {
      expect((await card.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await card.getByRole("button", { name: "Pause" }).click();
    await expect(card.getByRole("button", { name: "Play" })).toBeVisible();
    await card.getByRole("button", { name: "Next track" }).click();
    await expect.poll(() => controls).toEqual(["pause", "next"]);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("Spotify card disables controls on a free account and says why", async ({ page }) => {
  const controls = await mockSpotify(page, { premium: false });
  await page.goto("/?mode=display");
  const card = page.getByRole("region", { name: "Now playing on Spotify" });
  await expect(card.getByText("Test Song")).toBeVisible();
  await expect(card.getByRole("button", { name: "Next track" })).toBeDisabled();
  await expect(card.getByRole("status")).toHaveText("Play, pause and skip need Spotify Premium.");
  expect(controls).toEqual([]);
});

test("Spotify toggle in Display hides and shows the card", async ({ page }) => {
  await mockSpotify(page);
  await page.goto("/?mode=display");
  const card = page.getByRole("region", { name: "Now playing on Spotify" });
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "Spotify: on" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Spotify: off" }).click();
  await expect(card.getByText("Test Song")).toBeVisible();
});

test("Settings take a client ID and show the redirect URI to register", async ({ page }) => {
  await page.goto("/");
  await clickHeaderAction(page, "Settings");
  const dialog = page.getByRole("dialog");
  const connect = dialog.getByRole("button", { name: "Connect Spotify" });
  await expect(connect).toBeDisabled();
  const field = dialog.getByRole("textbox", { name: "Client ID" });
  await field.fill("abc");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("A client ID is 32 letters and digits.")).toBeVisible();
  await field.fill(CLIENT_ID);
  await expect(connect).toBeEnabled();
  await expect(dialog.locator(".settings-code")).toHaveText(new URL("/", page.url()).href);
  await dialog.getByRole("checkbox", { name: /Spotify in Display mode/ }).check();
  expect((await new AxeBuilder({ page }).include("dialog").analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect Spotify" })).toBeVisible();
});

test("returning from Spotify sign-in exchanges the code and restores the page", async ({ page }) => {
  await page.route("https://accounts.spotify.com/api/token", async (r) => {
    const body = new URLSearchParams(r.request().postData() ?? "");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("v".repeat(43));
    expect(body.get("client_id")).toBe(CLIENT_ID);
    await r.fulfill({ json: { access_token: "new-at", refresh_token: "new-rt", expires_in: 3600 } });
  });
  await page.goto("/");
  await page.evaluate((clientId) => {
    localStorage.setItem("sudoku:v1:settings", JSON.stringify({ nowPlaying: true, spotifyClientId: clientId }));
    sessionStorage.setItem("sudoku:v1:spotify-pending", JSON.stringify({ verifier: "v".repeat(43), state: "s1", returnSearch: "?mode=display" }));
  }, CLIENT_ID);
  await page.goto("/?code=the-code&state=s1");
  await expect(page.locator(".display-time")).toBeVisible();
  expect(new URL(page.url()).search).toBe("?mode=display");
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sudoku:v1:spotify-tokens") ?? "null")?.accessToken))
    .toBe("new-at");
});

test("an expired sign-in is renewed once even when requests overlap", async ({ page }) => {
  let refreshes = 0;
  await page.addInitScript((clientId) => {
    localStorage.setItem("sudoku:v1:settings", JSON.stringify({ nowPlaying: true, spotifyClientId: clientId }));
    localStorage.setItem("sudoku:v1:spotify-tokens", JSON.stringify({ accessToken: "old", refreshToken: "rt", expiresAt: 0 }));
  }, CLIENT_ID);
  await page.route("https://accounts.spotify.com/api/token", async (r) => {
    refreshes++;
    expect(new URLSearchParams(r.request().postData() ?? "").get("refresh_token")).toBe("rt");
    await new Promise((res) => setTimeout(res, 300));
    await r.fulfill({ json: { access_token: "at", refresh_token: "rt2", expires_in: 3600 } });
  });
  await page.route("https://i.scdn.co/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("https://api.spotify.com/v1/me", (r) => r.fulfill({ json: { product: "premium" } }));
  await page.route("https://api.spotify.com/v1/me/player**", (r) => r.fulfill({ json: playback(true) }));
  await page.goto("/?mode=display");
  await expect(page.getByRole("region", { name: "Now playing on Spotify" }).getByText("Test Song")).toBeVisible();
  expect(refreshes).toBe(1);
});
