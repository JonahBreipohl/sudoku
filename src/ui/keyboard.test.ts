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
    expect(key("q", { ctrlKey: true })).toBeNull();
    expect(key("1", { metaKey: true })).toBeNull();
    expect(key("Enter")).toBeNull();
    expect(key("F1")).toBeNull();
  });

  it("maps Shift+digit (by physical key) to a note, in any layout of the shifted symbol", () => {
    expect(actionForKey({ key: "!", code: "Digit1", shiftKey: true, ctrlKey: false, metaKey: false, altKey: false })).toEqual({
      type: "note",
      digit: 1,
    });
    expect(actionForKey({ key: "9", code: "Numpad9", shiftKey: true, ctrlKey: false, metaKey: false, altKey: false })).toEqual({
      type: "note",
      digit: 9,
    });
    expect(actionForKey({ key: ")", code: "Digit0", shiftKey: true, ctrlKey: false, metaKey: false, altKey: false })).toBeNull();
  });

  it("maps N to toggle-notes and does not treat other letters that way", () => {
    expect(key("n")).toEqual({ type: "toggle-notes" });
    expect(key("N")).toEqual({ type: "toggle-notes" });
    expect(key("n", { ctrlKey: true })).toBeNull();
  });

  describe("modifier bindings", () => {
    for (const mod of ["ctrlKey", "metaKey"] as const) {
      const press = (k: string, shiftKey = false) =>
        actionForKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey, [mod]: true });
      it(`handles undo and redo with ${mod}`, () => {
        expect(press("z")).toEqual({ type: "undo" });
        expect(press("Z", true)).toEqual({ type: "redo" });
        expect(press("y")).toEqual({ type: "redo" });
        expect(press("Y", true)).toBeNull();
        expect(press("z", true)).toEqual({ type: "redo" });
      });
      it(`does not fire plain bindings with ${mod}`, () => {
        for (const k of ["1", "p", "?", "n", "h", "H", "Backspace", "ArrowUp"]) expect(press(k)).toBeNull();
      });
    }
    it("ignores Alt", () => {
      expect(key("z", { ctrlKey: true, altKey: true })).toBeNull();
      expect(key("p", { altKey: true })).toBeNull();
    });
  });

  it("maps P, ?, N and H", () => {
    expect(key("p")).toEqual({ type: "pause" });
    expect(key("P")).toEqual({ type: "pause" });
    expect(key("?")).toEqual({ type: "help" });
    expect(key("n")).toEqual({ type: "toggle-notes" });
    expect(key("H")).toEqual({ type: "hint" });
    expect(key("h")).toEqual({ type: "move", direction: "left" });
  });
});
