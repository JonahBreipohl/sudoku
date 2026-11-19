import type { ThemePref } from "../state/settings";

/**
 * jonahbreipohl.com and each project on its subdomains share the theme through one cookie, since
 * localStorage never crosses origins. A choice made on any of them carries to the rest; "system"
 * means follow the device. The other sites read it before first paint, the same as index.html here.
 */
export const SHARED_THEME_COOKIE = "jb-theme";
const SITE = /(^|\.)jonahbreipohl\.com$/;

export function readSharedTheme(cookie: string): ThemePref | null {
  const m = /(?:^|;\s*)jb-theme=(light|dark|system)(?:;|$)/.exec(cookie);
  return (m?.[1] as ThemePref | undefined) ?? null;
}

/** The Set-Cookie string for a choice: site-wide on the real domain, host-only anywhere else. */
export function sharedThemeCookie(pref: ThemePref, hostname: string, protocol: string): string {
  const domain = SITE.test(hostname) ? "; domain=jonahbreipohl.com" : "";
  const secure = protocol === "https:" ? "; secure" : "";
  return `${SHARED_THEME_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax${domain}${secure}`;
}
