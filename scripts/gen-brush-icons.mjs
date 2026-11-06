// Brush-ink icon generator: stroke centerlines + width profiles -> filled outlines on a 24px grid.
// Run `node scripts/gen-brush-icons.mjs` after editing a drawing below; it rewrites the path table
// in src/ui/icons.tsx (between the generated markers) and nothing else.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const R = (n) => Math.round(n * 10) / 10;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function cr(p0, p1, p2, p3, t) { // Catmull-Rom
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map((i) => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}
function spline(pts, n) {
  if (pts.length === 2) return Array.from({ length: n + 1 }, (_, i) => [pts[0][0] + (pts[1][0] - pts[0][0]) * i / n, pts[0][1] + (pts[1][1] - pts[0][1]) * i / n]);
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const segs = pts.length - 1, per = Math.max(3, Math.ceil(n / segs));
  const out = [];
  for (let s = 0; s < segs; s++) for (let k = 0; k < per; k++) out.push(cr(P[s], P[s + 1], P[s + 2], P[s + 3], k / per));
  out.push(pts[pts.length - 1]);
  return out;
}
function stroke(pts, { w = 2.4, a = 0.4, b = 0.4, n = 14, swell = 0 } = {}) {
  const c = spline(pts, n), m = c.length;
  const L = [], Rr = [];
  for (let i = 0; i < m; i++) {
    const t = i / (m - 1);
    const prev = c[Math.max(0, i - 1)], next = c[Math.min(m - 1, i + 1)];
    let dx = next[0] - prev[0], dy = next[1] - prev[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const prof = (a + (1 - a) * sstep(0, 0.3, t)) * (b + (1 - b) * sstep(1, 0.62, t)) * (1 + swell * Math.sin(Math.PI * t));
    const h = (w * prof) / 2;
    L.push([c[i][0] - dy * h, c[i][1] + dx * h]);
    Rr.push([c[i][0] + dy * h, c[i][1] - dx * h]);
  }
  const poly = [...L, ...Rr.reverse()];
  return poly;
}
function chaikin(poly, it = 2) {
  let p = poly;
  for (let k = 0; k < it; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    p = q;
  }
  return p;
}
function blob(cx, cy, rx, ry, rot = 0, wob = 0.04, n = 28) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2, k = 1 + wob * Math.sin(3 * th + 1);
    const x = rx * k * Math.cos(th), y = ry * k * Math.sin(th);
    p.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return p;
}
const area = (p) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0);
const norm = (p) => (area(p) < 0 ? [...p].reverse() : p);
const d = (polys) => polys.map(norm).map((p) => "M" + p.map(([x, y]) => `${R(x)} ${R(y)}`).join("L") + "Z").join("");

const I = {};
I.undo = d([
  stroke([[19, 19.2], [19.8, 14.2], [17.4, 10.6], [12.8, 9.3], [7.6, 10]], { w: 2.8, a: 0.3, b: 0.9 }),
  stroke([[6, 10.2], [10.4, 5.4]], { w: 2.6, a: 1, b: 0.35, n: 6 }),
  stroke([[6, 10.2], [10.8, 14.6]], { w: 2.6, a: 1, b: 0.35, n: 6 }),
]);
I.check = d([
  stroke([[4.4, 12.6], [9.6, 18.4]], { w: 3.4, a: 0.45, b: 1, n: 6 }),
  stroke([[8.4, 18.2], [13.6, 11.2], [20.2, 5.2]], { w: 3.4, a: 1, b: 0.18 }),
]);
I.x = d([
  stroke([[5.2, 5.4], [18.8, 18.6]], { w: 3.2, a: 0.25, b: 0.3, n: 8, swell: 0.1 }),
  stroke([[18.6, 5.2], [5.4, 18.8]], { w: 3.2, a: 0.3, b: 0.25, n: 8, swell: 0.1 }),
]);
{
  const rays = [];
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2 + 0.2;
    rays.push(stroke([[12 + 7.4 * Math.cos(t), 12 + 7.4 * Math.sin(t)], [12 + 10.8 * Math.cos(t), 12 + 10.8 * Math.sin(t)]], { w: 2.4, a: 1, b: 0.25, n: 4 }));
  }
  I.sun = d([blob(12, 12, 4.4, 4.4), ...rays]);
}
{
  const C1 = [11.2, 12.6], r1 = 9, C2 = [16.4, 9.2], r2 = 7.6, n = 120;
  const O = [], Iin = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * 2 * Math.PI;
    const p = [C1[0] + r1 * Math.cos(th), C1[1] + r1 * Math.sin(th)];
    if (Math.hypot(p[0] - C2[0], p[1] - C2[1]) > r2) O.push([th, p]);
    const q = [C2[0] + r2 * Math.cos(th), C2[1] + r2 * Math.sin(th)];
    if (Math.hypot(q[0] - C1[0], q[1] - C1[1]) < r1) Iin.push([th, q]);
  }
  // rotate so the arcs are contiguous
  const rot = (A) => { const k = A.findIndex((e, i) => A[(i + A.length - 1) % A.length][0] > e[0]); return k > 0 ? [...A.slice(k), ...A.slice(0, k)] : A; };
  const o = rot(O).map((e) => e[1]), inn = rot(Iin).map((e) => e[1]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const last = o[o.length - 1];
  const poly = dist(last, inn[0]) < dist(last, inn[inn.length - 1]) ? [...o, ...inn] : [...o, ...inn.reverse()];
  I.moon = d([poly]);
}
I.erase = d([
  stroke([[9.6, 5.4], [20.4, 5.4]], { w: 2.2, a: 0.5, b: 0.8, n: 5 }),
  stroke([[20.4, 5.2], [20.4, 18.8]], { w: 2.2, a: 0.8, b: 0.8, n: 5 }),
  stroke([[20.4, 18.6], [9.6, 18.6]], { w: 2.2, a: 0.8, b: 0.5, n: 5 }),
  stroke([[9.8, 5.2], [2.8, 12]], { w: 2.2, a: 0.7, b: 0.9, n: 5 }),
  stroke([[2.8, 12], [9.8, 18.8]], { w: 2.2, a: 0.9, b: 0.7, n: 5 }),
  stroke([[12.6, 9.4], [17.2, 14.6]], { w: 2.2, a: 0.4, b: 0.4, n: 5 }),
  stroke([[17.2, 9.4], [12.6, 14.6]], { w: 2.2, a: 0.4, b: 0.4, n: 5 }),
]);
I.pause = d([
  stroke([[8, 5], [8.3, 19]], { w: 4.2, a: 0.75, b: 0.75, n: 8, swell: 0.05 }),
  stroke([[16, 5], [16.3, 19]], { w: 4.2, a: 0.75, b: 0.75, n: 8, swell: 0.05 }),
]);
const tri = [[6.8, 4.6], [6.8, 4.6], [19.6, 12], [19.6, 12], [6.8, 19.4], [6.8, 19.4]];
I.play = d([chaikin(tri, 3)]);
I.prev = d([stroke([[5.6, 5], [5.8, 19]], { w: 2.8, a: 0.45, b: 0.45, n: 8 }), chaikin(tri.map(([x, y]) => [25.4 - x, y]), 3)]);
I.next = d([stroke([[18.4, 5], [18.2, 19]], { w: 2.8, a: 0.45, b: 0.45, n: 8 }), chaikin(tri.map(([x]) => x).map((x, i) => [x - 1.4, tri[i][1]]), 3)]);
{
  const s = [];
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 4.5 : 10.4, t = -Math.PI / 2 + (k * Math.PI) / 5; s.push([12 + r * Math.cos(t), 12.8 + r * Math.sin(t)]); }
  I.star = d([chaikin(s, 3)]);
}
I.hourglass = d([
  stroke([[6, 4], [18, 4.2]], { w: 2.4, a: 0.5, b: 0.5, n: 5 }),
  stroke([[6, 20], [18, 19.8]], { w: 2.4, a: 0.5, b: 0.5, n: 5 }),
  stroke([[7.6, 4.6], [8, 8.2], [12, 12], [8, 15.8], [7.6, 19.4]], { w: 2.2, a: 0.7, b: 0.7, n: 18 }),
  stroke([[16.4, 4.6], [16, 8.2], [12, 12], [16, 15.8], [16.4, 19.4]], { w: 2.2, a: 0.7, b: 0.7, n: 18 }),
  chaikin([[9.6, 18.6], [14.4, 18.6], [12, 14.8]], 2),
]);
I.dot = d([blob(12, 12, 4.8, 4.6, 0.3, 0.05)]);
I.arrowLeft = d([
  stroke([[20.4, 12], [6, 12]], { w: 3, a: 0.3, b: 1, n: 8 }),
  stroke([[4.8, 12], [11, 5.8]], { w: 2.8, a: 1, b: 0.35, n: 6 }),
  stroke([[4.8, 12], [11, 18.2]], { w: 2.8, a: 1, b: 0.35, n: 6 }),
]);
I.pencil = d([
  stroke([[4.6, 19.6], [17.6, 6.6]], { w: 4.6, a: 0.04, b: 1, n: 10 }),
  stroke([[15.8, 4.6], [19.6, 8.4]], { w: 3, a: 0.8, b: 0.8, n: 4 }),
  stroke([[12.6, 20.2], [21, 20.2]], { w: 2, a: 0.4, b: 0.7, n: 4 }),
]);
I.note = d([
  blob(9.2, 18, 3.9, 2.9, -0.35, 0.03),
  stroke([[12.4, 17.2], [12.8, 4.4]], { w: 2.4, a: 1, b: 0.9, n: 8 }),
  stroke([[12.8, 4.6], [15.2, 7.4], [19.4, 9.6]], { w: 2.8, a: 1, b: 0.15, n: 10 }),
]);
I.alert = d([stroke([[12, 3.6], [12, 14.4]], { w: 4, a: 1, b: 0.4, n: 8, swell: 0.1 }), blob(12, 19.4, 2.3, 2.2)]);
I.diamond = d([chaikin([[12, 2.2], [12, 2.2], [21.8, 12], [21.8, 12], [12, 21.8], [12, 21.8], [2.2, 12], [2.2, 12]], 3)]);
I.question = d([
  stroke([[7.6, 8.4], [9.2, 5], [12.4, 3.8], [15.6, 5.6], [15.6, 9], [12.8, 11.6], [12, 14.8]], { w: 3.2, a: 0.4, b: 0.6, n: 22 }),
  blob(12, 19.6, 2.3, 2.2),
]);
{
  const sp = (cx, cy, R1, r1) => chaikin([[cx, cy - R1], [cx + r1, cy - r1], [cx + R1, cy], [cx + r1, cy + r1], [cx, cy + R1], [cx - r1, cy + r1], [cx - R1, cy], [cx - r1, cy - r1]], 2);
  I.sparkle = d([sp(11.4, 12.6, 9.6, 2.2), sp(19.4, 4.6, 3.6, 0.9)]);
}
const corner = (x, y, sx, sy, inward) => {
  const L = 6.2;
  if (!inward) return [stroke([[x, y + sy * L], [x, y]], { w: 2.8, a: 0.4, b: 1, n: 5 }), stroke([[x - sx * 0.2, y], [x + sx * L, y]], { w: 2.8, a: 1, b: 0.4, n: 5 })];
  return [stroke([[x, y], [x, y + sy * L]], { w: 2.8, a: 1, b: 0.4, n: 5 }), stroke([[x - sx * 0.2, y], [x + sx * L, y]], { w: 2.8, a: 1, b: 0.4, n: 5 })];
};
I.expand = d([...corner(4.4, 4.4, 1, 1, false), ...corner(19.6, 4.4, -1, 1, false), ...corner(4.4, 19.6, 1, -1, false), ...corner(19.6, 19.6, -1, -1, false)]);
I.shrink = d([...corner(9.6, 9.6, -1, -1, true).map((p) => p), ...corner(14.4, 9.6, 1, -1, true), ...corner(9.6, 14.4, -1, 1, true), ...corner(14.4, 14.4, 1, 1, true)]);
I.eye = d([
  stroke([[2.4, 12], [7, 7.2], [12, 5.8], [17, 7.2], [21.6, 12]], { w: 2.6, a: 0.3, b: 0.3, n: 16, swell: 0.15 }),
  stroke([[2.6, 12.2], [7, 16.8], [12, 18.2], [17, 16.8], [21.4, 12.2]], { w: 2.2, a: 0.3, b: 0.3, n: 16 }),
  blob(12, 12, 3.2, 3.2),
]);
I.sliders = d([
  stroke([[3, 6], [21, 6.2]], { w: 2.2, a: 0.4, b: 0.4, n: 6 }),
  stroke([[3, 12], [21, 11.8]], { w: 2.2, a: 0.4, b: 0.4, n: 6 }),
  stroke([[3, 18], [21, 18.2]], { w: 2.2, a: 0.4, b: 0.4, n: 6 }),
  blob(8, 6.1, 2.9, 2.9), blob(15.5, 11.9, 2.9, 2.9), blob(9.5, 18.1, 2.9, 2.9),
]);

const target = fileURLToPath(new URL("../src/ui/icons.tsx", import.meta.url));
const START = "  // <generated by scripts/gen-brush-icons.mjs>\n";
const END = "  // </generated>\n";
const text = readFileSync(target, "utf8");
const a = text.indexOf(START);
const b = text.indexOf(END);
if (a < 0 || b < a) throw new Error("icons.tsx is missing its generated markers");
const body = Object.entries(I).map(([name, path]) => `  ${name}:\n    "${path}",\n`).join("");
writeFileSync(target, text.slice(0, a + START.length) + body + text.slice(b));
console.log(`${Object.keys(I).length} icons written to src/ui/icons.tsx`);
