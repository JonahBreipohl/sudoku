/**
 * The scene's WebGL2 context, created once in the initial bundle so the same canvas both answers
 * "is this a real GPU?" and then hosts the renderer: no throwaway probe context to lose, and no
 * warning in the console. No three.js here.
 */

/** Fixed at the first getContext call, so these are the renderer's attributes too. */
export const GL_ATTRS: WebGLContextAttributes = {
  antialias: false,
  alpha: false,
  depth: true,
  stencil: false,
  powerPreference: "low-power",
};

export interface SceneContext {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
}

/** Chrome and Safari report a generic RENDERER; Firefox gives the real one there. */
export const isMaskedRenderer = (name: string) => /^(webkit webgl|mozilla|generic renderer)?$/i.test(name.trim());

/** CPU rasterizers, which draw the full-screen sky slowly enough to stall the page. */
export const isSoftwareRenderer = (name: string) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);

/** The renderer's name, asking the debug extension only when the plain answer is masked. */
export function rendererName(gl: Pick<WebGL2RenderingContext, "getParameter" | "getExtension" | "RENDERER">): string {
  const plain = String(gl.getParameter(gl.RENDERER) ?? "");
  if (!isMaskedRenderer(plain)) return plain;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "") : plain;
}

/**
 * A context for the scene, or null when there is none worth using: no WebGL2, or a software
 * renderer (unless `force`, for `?scene=webgl`). A refused context is simply dropped.
 */
export function createSceneContext(force: boolean): SceneContext | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", GL_ATTRS);
  if (!gl) return null;
  if (!force && isSoftwareRenderer(rendererName(gl))) return null;
  return { canvas, gl };
}
