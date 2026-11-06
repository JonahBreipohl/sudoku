import { describe, expect, it } from "vitest";
import { cloudTopAt, compose, framing, type Layout } from "./compose";
import { contains } from "./geom";

const desktop: Layout = {
  view: { w: 1440, h: 900 },
  mode: "play",
  board: { x: 423, y: 52, w: 594, h: 594 },
  panel: { x: 423, y: 656, w: 594, h: 100 },
};
const phone: Layout = {
  view: { w: 390, h: 844 },
  mode: "play",
  board: { x: 16, y: 44, w: 358, h: 358 },
  panel: { x: 16, y: 585, w: 358, h: 243 },
};
const display: Layout = {
  view: { w: 1440, h: 900 },
  mode: "display",
  board: { x: 718, y: 113, w: 660, h: 660 },
  text: { x: 70, y: 330, w: 560, h: 230 },
};

describe("framing", () => {
  it("picks the side gutters on a desktop, the free band on a tall phone, the landscape still for Display", () => {
    expect(framing(desktop)).toBe("gutters");
    expect(framing(phone)).toBe("band");
    expect(framing(display)).toBe("display");
  });

  it("falls back to a corner twig when nothing has room (phone landscape)", () => {
    expect(framing({ view: { w: 844, h: 390 }, mode: "play", board: { x: 16, y: 40, w: 334, h: 334 }, panel: { x: 366, y: 40, w: 460, h: 330 } })).toBe("corner");
  });
});

describe("compose", () => {
  for (const [name, l] of [["desktop", desktop], ["phone", phone], ["display", display]] as const) {
    describe(name, () => {
      const c = compose(l);

      it("is reproducible", () => {
        expect(compose(l)).toEqual(c);
      });

      it("reaches in from outside the screen", () => {
        const [x, y] = c.limbs[0]!.points[0]!;
        expect(x < 0 || x > l.view.w || y < 0 || y > l.view.h).toBe(true);
      });

      it("has blossoms, each at least partly on screen and none wholly behind the board", () => {
        expect(c.blossoms.length).toBeGreaterThan(15);
        for (const b of c.blossoms) {
          expect(b.x).toBeGreaterThan(-b.size);
          expect(b.x).toBeLessThan(l.view.w + b.size);
          expect(contains(l.board!, b.x, b.y, b.size * 0.5)).toBe(false);
        }
      });

      it("keeps the storm's sources and the moon on screen", () => {
        expect(c.sources.length).toBeGreaterThan(3);
        expect(c.moon.x).toBeGreaterThan(0);
        expect(c.moon.x).toBeLessThan(l.view.w);
      });
    });
  }

  it("keeps blossoms out of the header row above the board on a desktop", () => {
    const b = desktop.board!;
    for (const f of compose(desktop).blossoms) {
      const overHeader = f.x > b.x - 32 && f.x < b.x + b.w + 32 && f.y < b.y;
      expect(overHeader).toBe(false);
    }
  });

  it("keeps the desktop branch in the left gutter", () => {
    const main = compose(desktop).limbs[0]!;
    for (const [x] of main.points) expect(x).toBeLessThan(desktop.board!.x);
  });

  it("fills the band between board and pad on a tall phone", () => {
    const top = phone.board!.y + phone.board!.h;
    const ys = compose(phone).blossoms.map((b) => b.y);
    const inBand = ys.filter((y) => y > top && y < phone.panel!.y).length;
    expect(inBand / ys.length).toBeGreaterThan(0.8);
  });

  it("keeps the Display clock's text clear of the branch and blossoms", () => {
    const t = display.text!;
    for (const b of compose(display).blossoms) expect(contains(t, b.x, b.y, -b.size * 0.5)).toBe(false);
    for (const limb of compose(display).limbs) for (const [x, y] of limb.points) expect(contains(t, x, y)).toBe(false);
  });

  // Text over a cloud must sit inside it, never across its ink outline.
  const clearOver = (l: Layout, r: { x: number; y: number; w: number; h: number }, margin: number) => {
    for (const c of compose(l).clouds)
      for (let x = r.x; x <= r.x + r.w; x += 4) {
        const top = cloudTopAt(c, x);
        // The outline at this column is above the text or below it, never through it.
        const through = top >= r.y - margin && top <= r.y + r.h;
        expect(through, `cloud top ${top.toFixed(0)} at x=${x}`).toBe(false);
      }
  };

  it("keeps cloud outlines above the controls on a desktop and a phone", () => {
    clearOver(desktop, desktop.panel!, 0);
    clearOver(phone, phone.panel!, 0);
  });

  it("keeps the Display tower's outline above the clock", () => {
    clearOver(display, display.text!, 12);
  });
});
