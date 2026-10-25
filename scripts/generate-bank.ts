// Pre-generates graded puzzles per difficulty into public/puzzles/<level>.json.
//   npm run gen:bank -- --level hard --count 50 --seed 1 [--time-limit <seconds>]
//   npm run gen:bank -- --all [--count <n>] [--seed <s>]   (default counts: 200/200/150/100/50)
//   npm run gen:bank -- --validate                          (deep-check the committed files)
// --count is the target total per file. Rerunning with an existing file resumes: it appends new
// puzzles up to the target and never duplicates one.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyBank, extendBank, serializeBank, validateBank, type Bank } from "../src/engine/bank";
import { LEVELS, type Level } from "../src/engine/step";

const DEFAULT_COUNTS: Readonly<Record<Level, number>> = { easy: 200, medium: 200, hard: 150, expert: 100, master: 50 };
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "puzzles");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function load(level: Level): Bank {
  const file = join(dir, `${level}.json`);
  if (!existsSync(file)) return emptyBank(level, new Date().toISOString().slice(0, 10));
  const json: unknown = JSON.parse(readFileSync(file, "utf8"));
  const res = validateBank(json);
  if (!res.ok) die(`${file} is invalid, refusing to append:\n${res.errors.join("\n")}`);
  return json as Bank; // validated just above
}

function save(bank: Bank): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${bank.level}.json`), serializeBank(bank));
}

if (flag("validate")) {
  let bad = false;
  for (const level of LEVELS) {
    const file = join(dir, `${level}.json`);
    if (!existsSync(file)) {
      console.error(`${level}: missing`);
      bad = true;
      continue;
    }
    const json: unknown = JSON.parse(readFileSync(file, "utf8"));
    const res = validateBank(json, { deep: true });
    console.log(`${level}: ${res.ok ? "ok" : res.errors.join("\n  ")}`);
    if (!res.ok) bad = true;
  }
  process.exit(bad ? 1 : 0);
}

const levelArg = arg("level");
if (!flag("all") && !levelArg) die("usage: gen:bank -- (--level <level> | --all) [--count n] [--seed s] [--time-limit seconds]");
if (levelArg && !(LEVELS as readonly string[]).includes(levelArg)) die(`unknown level ${levelArg}`);
const levels = flag("all") ? LEVELS : [levelArg as Level];
const seed = arg("seed") ?? "1";
const limit = arg("time-limit");
const countArg = arg("count");
if (countArg !== undefined && !(Number.isInteger(Number(countArg)) && Number(countArg) > 0)) die("--count must be a positive integer");

for (const level of levels) {
  const count = countArg ? Number(countArg) : DEFAULT_COUNTS[level];
  const start = Date.now();
  const bank = load(level);
  const before = bank.puzzles.length;
  console.log(`${level}: ${before} existing, target ${count}, seed ${seed}`);
  const result = extendBank(bank, {
    level,
    seed,
    count,
    deadline: limit ? start + Number(limit) * 1000 : undefined,
    onPuzzle: (b) => {
      const n = b.puzzles.length;
      if (n % 10 === 0 || n === count) {
        console.log(`  ${level} ${n}/${count} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
        save({ ...b, puzzles: b.puzzles.slice().sort((x, y) => x.score - y.score || x.id.localeCompare(y.id)) });
      }
    },
  });
  save(result);
  const note = result.puzzles.length < count ? " (stopped at the time limit)" : "";
  console.log(`${level}: wrote ${result.puzzles.length} (+${result.puzzles.length - before}) in ${((Date.now() - start) / 1000).toFixed(1)}s${note}`);
}
