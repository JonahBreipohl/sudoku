// Measures how many attempts generate() needs per seed, to check DEFAULT_MAX_ATTEMPTS has
// headroom. Not part of `npm run check`: Hard alone takes minutes over a few hundred seeds.
//   npx tsx scripts/sweep-attempts.ts [--level hard] [--from 0] [--to 200] [--raw]
// Without --level it sweeps every level. The cap is lifted to 10x the default budget so a seed
// over budget is reported with its real attempt count instead of throwing. Seeds are
// independent, so split --from/--to across processes to use several cores.
// Flag any seed that needs more than a third of its budget (the bar for raising the budget).

import { DEFAULT_MAX_ATTEMPTS, generate } from "../src/engine/generate";
import { LEVELS, type Level } from "../src/engine/step";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const levelArg = arg("level");
if (levelArg && !(LEVELS as readonly string[]).includes(levelArg)) {
  console.error(`unknown level ${levelArg}`);
  process.exit(1);
}
const levels: readonly Level[] = levelArg ? [levelArg as Level] : LEVELS;
const from = Number(arg("from") ?? 0);
const to = Number(arg("to") ?? 200);
if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from) {
  console.error("--from and --to must be integers with 0 <= from < to");
  process.exit(1);
}

// --raw also prints one "raw <level> <seed> <attempts>" line per seed, to merge parallel runs.
const raw = process.argv.includes("--raw");

const percentile = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;

for (const level of levels) {
  const budget = DEFAULT_MAX_ATTEMPTS[level];
  const attempts: number[] = [];
  const times: number[] = [];
  let worst = { seed: from, attempts: 0 };
  const failed: number[] = [];
  for (let seed = from; seed < to; seed++) {
    const start = performance.now();
    try {
      const result = generate({ level, seed, maxAttempts: budget * 10 });
      attempts.push(result.attempts);
      if (raw) console.log(`raw ${level} ${seed} ${result.attempts}`);
      if (result.attempts > worst.attempts) worst = { seed, attempts: result.attempts };
    } catch {
      failed.push(seed);
    }
    times.push(performance.now() - start);
  }
  attempts.sort((a, b) => a - b);
  times.sort((a, b) => a - b);
  const over = attempts.filter((n) => n > budget / 3).length;
  const mean = attempts.reduce((sum, n) => sum + n, 0) / Math.max(1, attempts.length);
  console.log(
    `${level} seeds ${from}..${to - 1}: budget ${budget}, attempts mean ${mean.toFixed(1)} median ${percentile(attempts, 0.5)} ` +
      `p90 ${percentile(attempts, 0.9)} max ${worst.attempts} (seed ${worst.seed}), ` +
      `over a third of budget: ${over}, beyond 10x budget: ${failed.length}${failed.length ? ` (seeds ${failed.join(",")})` : ""}; ` +
      `ms median ${percentile(times, 0.5).toFixed(0)} max ${times[times.length - 1]!.toFixed(0)}`,
  );
}
