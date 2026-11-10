/** Proposed `scripts/golden-verify` (execution-plan.md section 6). Usage: npm run golden-verify -- [case-file] */
import { readFileSync } from 'node:fs';
import { runGolden, type GoldenFile } from '../packages/rules/golden/run.ts';

const path = process.argv[2] ?? new URL('../packages/rules/golden/catalogue-cases.json', import.meta.url).pathname;
const file = JSON.parse(readFileSync(path, 'utf8')) as GoldenFile;
const { passed, failures } = runGolden(file);
console.log(`golden-verify: ${passed}/${file.cases.length} equal (${file.source})`);
for (const f of failures) console.log(`  MISMATCH ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
