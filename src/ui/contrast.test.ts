import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Parses the token blocks out of styles.css so the audit can never drift from what ships.
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function block(startMarker: string): Record<string, string> {
  const start = css.indexOf(startMarker);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[m[1]!] = m[2]!;
  return out;
}

const light = block(":root {");
const dark = { ...light, ...block(':root[data-theme="dark"]') };
const darkMedia = { ...light, ...block(':root:not([data-theme="light"])') };

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [foreground, background, minimum ratio]. Digits in cells are large text (3:1). */
const PAIRS: [string, string, number][] = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text-muted", "bg", 4.5],
  ["text-muted", "surface", 4.5],
  ["text", "pad-bg", 4.5],
  ["note", "surface", 4.5],
  ["note", "related", 4.5],
  ["note", "same", 4.5],
  ["note", "selected", 4.5],
  ["given", "surface", 3],
  ["given", "given-bg", 3],
  ["given", "related", 3],
  ["given", "same", 3],
  ["given", "selected", 3],
  ["entry", "surface", 3],
  ["entry", "related", 3],
  ["entry", "same", 3],
  ["entry", "selected", 3],
  ["conflict", "surface", 3],
  ["conflict", "related", 3],
  ["conflict", "same", 3],
  ["conflict", "selected", 3],
  ["conflict", "conflict-bg", 3],
  ["text", "conflict-bg", 4.5],
  ["text", "mark-root-bg", 4.5],
  ["text", "mark-support-bg", 4.5],
  ["entry", "mark-root-bg", 3],
  ["entry", "mark-support-bg", 3],
  ["mark-root", "mark-root-bg", 3],
  ["mark-support", "mark-support-bg", 3],
  ["mark-root", "surface", 3],
  ["mark-support", "surface", 3],
  ["pad-done", "pad-bg", 3],
  ["focus", "bg", 3],
  ["focus", "surface", 3],
  ["line-strong", "bg", 3],
  ["line-strong", "surface", 3],
];

describe.each([
  ["light", light],
  ["dark (data-theme)", dark],
  ["dark (system media query)", darkMedia],
])("contrast, %s theme", (_name, tokens) => {
  it.each(PAIRS)("%s on %s is at least %d:1", (fg, bg, min) => {
    expect(tokens[fg], `token --${fg}`).toBeDefined();
    expect(tokens[bg], `token --${bg}`).toBeDefined();
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(min);
  });
});

it("dark overrides are identical in the attribute and media-query blocks", () => {
  expect(darkMedia).toEqual(dark);
});
