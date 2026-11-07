import { describe, expect, it, vi } from "vitest";
import { isMaskedRenderer, isSoftwareRenderer, rendererName } from "./gl";

const RENDERER = 0x1f01;
const UNMASKED = 0x9246;

function fakeGl(plain: string, unmasked: string | null) {
  const getExtension = vi.fn((name: string) => (name === "WEBGL_debug_renderer_info" && unmasked !== null ? { UNMASKED_RENDERER_WEBGL: UNMASKED } : null));
  const getParameter = vi.fn((p: number) => (p === RENDERER ? plain : p === UNMASKED ? unmasked : null));
  return { gl: { RENDERER, getParameter, getExtension } as unknown as Parameters<typeof rendererName>[0], getExtension };
}

describe("rendererName", () => {
  it("uses the plain RENDERER when the browser reports the real one (Firefox), without the debug extension", () => {
    const { gl, getExtension } = fakeGl("llvmpipe (LLVM 17.0.6, 256 bits)", "unused");
    expect(rendererName(gl)).toBe("llvmpipe (LLVM 17.0.6, 256 bits)");
    expect(getExtension).not.toHaveBeenCalled();
  });

  it("asks the debug extension only when RENDERER is masked (Chrome, Safari)", () => {
    const { gl, getExtension } = fakeGl("WebKit WebGL", "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)");
    expect(rendererName(gl)).toMatch(/SwiftShader/);
    expect(getExtension).toHaveBeenCalledWith("WEBGL_debug_renderer_info");
  });

  it("falls back to the masked name when the extension is unavailable", () => {
    const { gl } = fakeGl("WebKit WebGL", null);
    expect(rendererName(gl)).toBe("WebKit WebGL");
  });
});

describe("renderer classification", () => {
  it("knows the masked generic names", () => {
    for (const n of ["WebKit WebGL", "Mozilla", "Generic Renderer", ""]) expect(isMaskedRenderer(n)).toBe(true);
    expect(isMaskedRenderer("ANGLE (Apple, Apple M2, OpenGL 4.1)")).toBe(false);
  });

  it("treats CPU rasterizers as software and real GPUs as hardware", () => {
    for (const n of ["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)", "llvmpipe (LLVM 17.0.6, 256 bits)", "Microsoft Basic Render Driver"])
      expect(isSoftwareRenderer(n)).toBe(true);
    for (const n of ["ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)", "Apple GPU", "Mali-G78"])
      expect(isSoftwareRenderer(n)).toBe(false);
  });
});
