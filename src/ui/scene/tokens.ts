/** The --scene-* custom properties (src/ui/scene/scene.css) the shaders take, by uniform role. */
export const SCENE_TOKENS = [
  "sky-top",
  "sky-horizon",
  "cloud",
  "cloud-shade",
  "ink",
  "blossom",
  "blossom-pale",
  "blossom-shade",
  "blossom-deep",
  "bark-light",
  "bark",
  "bark-shade",
  "rim",
  "moon",
  "lantern",
  "star",
] as const;

export type SceneToken = (typeof SCENE_TOKENS)[number];
export interface ScenePalette {
  colors: Record<SceneToken, string>;
  /** 1 at night (stars, moon, lanterns, rim light), 0 by day. */
  night: number;
}

/** Reads the current theme's scene tokens; `style` is a getComputedStyle result. */
export function readPalette(style: Pick<CSSStyleDeclaration, "getPropertyValue">): ScenePalette {
  const colors = {} as Record<SceneToken, string>;
  for (const t of SCENE_TOKENS) colors[t] = style.getPropertyValue(`--scene-${t}`).trim() || "#ff00ff";
  const night = Number.parseFloat(style.getPropertyValue("--scene-night"));
  return { colors, night: Number.isFinite(night) ? night : 0 };
}
