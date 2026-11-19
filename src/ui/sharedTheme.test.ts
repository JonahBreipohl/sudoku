import { describe, expect, it } from "vitest";
import { readSharedTheme, sharedThemeCookie } from "./sharedTheme";

describe("shared theme cookie", () => {
  it("reads the choice among other cookies", () => {
    expect(readSharedTheme("a=1; jb-theme=dark; b=2")).toBe("dark");
    expect(readSharedTheme("jb-theme=system")).toBe("system");
    expect(readSharedTheme("jb-theme=light")).toBe("light");
  });

  it("ignores anything else", () => {
    expect(readSharedTheme("")).toBeNull();
    expect(readSharedTheme("jb-theme=purple")).toBeNull();
    expect(readSharedTheme("xjb-theme=dark")).toBeNull();
    expect(readSharedTheme("jb-theme=darker")).toBeNull();
  });

  it("is site-wide on jonahbreipohl.com and host-only elsewhere", () => {
    expect(sharedThemeCookie("dark", "sudoku.jonahbreipohl.com", "https:")).toBe(
      "jb-theme=dark; path=/; max-age=31536000; samesite=lax; domain=jonahbreipohl.com; secure",
    );
    expect(sharedThemeCookie("light", "jonahbreipohl.com", "https:")).toContain("domain=jonahbreipohl.com");
    expect(sharedThemeCookie("light", "localhost", "http:")).toBe("jb-theme=light; path=/; max-age=31536000; samesite=lax");
    expect(sharedThemeCookie("dark", "notjonahbreipohl.com", "https:")).not.toContain("domain=");
  });
});
