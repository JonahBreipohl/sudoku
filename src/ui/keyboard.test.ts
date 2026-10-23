import { describe, expect, it } from "vitest";
import { actionForKey } from "./keyboard";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  actionForKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe("actionForKey", () => {
  it("maps arrows, WASD and hjkl to moves", () => {
    for (const [k, direction] of [
      ["ArrowUp", "up"],
      ["W", "up"],
      ["k", "up"],
      ["ArrowLeft", "left"],
      ["a", "left"],
      ["h", "left"],
      ["s", "down"],
      ["j", "down"],
      ["d", "right"],
      ["l", "right"],
    ] as const) {
      expect(key(k)).toEqual({ type: "move", direction });
    }
  });

  it("maps digits to place and 0/Backspace/Delete to erase", () => {
    expect(key("7")).toEqual({ type: "place", digit: 7 });
    for (const k of ["0", "Backspace", "Delete"]) expect(key(k)).toEqual({ type: "erase" });
  });

  it("leaves modified and unrelated keys alone", () => {
    expect(key("z", { ctrlKey: true })).toBeNull();
    expect(key("1", { metaKey: true })).toBeNull();
    expect(key("Enter")).toBeNull();
    expect(key("F1")).toBeNull();
  });
});
