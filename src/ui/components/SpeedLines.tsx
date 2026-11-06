// Manga focus lines: thin wedges fanning out from the middle. Static art, computed once, so the
// result dialog can put them behind a title without any motion.
const WEDGES = 56;

function wedgePoints(): string[] {
  const out: string[] = [];
  for (let i = 0; i < WEDGES; i++) {
    // A fixed pseudo-random spread (no Math.random: the art must be identical on every render).
    const jitter = Math.sin(i * 12.9898) * 0.5 + 0.5;
    const a = (i / WEDGES) * Math.PI * 2 + jitter * 0.05;
    const half = 0.012 + 0.03 * ((i * 7) % 5) / 4 * (0.4 + 0.6 * jitter);
    const r = 150;
    const p = (t: number) => `${(50 + r * Math.cos(t)).toFixed(1)},${(50 + r * Math.sin(t)).toFixed(1)}`;
    out.push(`50,50 ${p(a - half)} ${p(a + half)}`);
  }
  return out;
}

const POINTS = wedgePoints();

export function SpeedLines() {
  return (
    <svg className="speedlines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {POINTS.map((pts, i) => (
        <polygon key={i} points={pts} />
      ))}
    </svg>
  );
}
