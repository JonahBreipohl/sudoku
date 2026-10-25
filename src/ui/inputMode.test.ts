import { describe, expect, it } from "vitest";
import { initialInputMode, inputModeReducer, tapForLockedDigit, type InputModeState } from "./inputMode";

const df: InputModeState = { mode: "digit-first", locked: null };

describe("inputModeReducer", () => {
  it("locks a digit only in digit-first mode", () => {
    expect(inputModeReducer(initialInputMode(), { type: "digit", digit: 3 })).toEqual(initialInputMode());
    expect(inputModeReducer(df, { type: "digit", digit: 3 }).locked).toBe(3);
  });
  it("switches the lock and releases it on the same digit", () => {
    const s3 = inputModeReducer(df, { type: "digit", digit: 3 });
    expect(inputModeReducer(s3, { type: "digit", digit: 5 }).locked).toBe(5);
    expect(inputModeReducer(s3, { type: "digit", digit: 3 }).locked).toBeNull();
  });
  it("unlocks on escape and when the mode changes", () => {
    const s = inputModeReducer(df, { type: "digit", digit: 7 });
    expect(inputModeReducer(s, { type: "unlock" }).locked).toBeNull();
    expect(inputModeReducer(s, { type: "toggle-mode" })).toEqual({ mode: "cell-first", locked: null });
    expect(inputModeReducer(s, { type: "set-mode", mode: "cell-first" }).locked).toBeNull();
    expect(inputModeReducer(s, { type: "set-mode", mode: "digit-first" })).toBe(s);
  });
});

describe("tapForLockedDigit", () => {
  const locked: InputModeState = { mode: "digit-first", locked: 4 };
  it("places, erases on repeat, and ignores givens", () => {
    expect(tapForLockedDigit(locked, 0, false)).toEqual({ type: "place", digit: 4 });
    expect(tapForLockedDigit(locked, 2, false)).toEqual({ type: "place", digit: 4 });
    expect(tapForLockedDigit(locked, 4, false)).toEqual({ type: "erase" });
    expect(tapForLockedDigit(locked, 4, true)).toBeNull();
  });
  it("does nothing without a lock or in cell-first", () => {
    expect(tapForLockedDigit(df, 0, false)).toBeNull();
    expect(tapForLockedDigit({ mode: "cell-first", locked: 4 }, 0, false)).toBeNull();
  });
});
