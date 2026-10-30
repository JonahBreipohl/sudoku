import { describe, expect, it } from "vitest";
import { effectiveTheme, toggledTheme } from "./theme";

describe("theme switch", () => {
  it("resolves System through the OS preference", () => {
    expect(effectiveTheme("system", true)).toBe("dark");
    expect(effectiveTheme("system", false)).toBe("light");
    expect(effectiveTheme("light", true)).toBe("light");
  });

  it("flips what is shown and stores it explicitly", () => {
    expect(toggledTheme("system", true)).toBe("light");
    expect(toggledTheme("system", false)).toBe("dark");
    expect(toggledTheme("dark", false)).toBe("light");
    expect(toggledTheme("light", true)).toBe("dark");
  });
});
