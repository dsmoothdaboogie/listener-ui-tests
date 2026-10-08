// Regenerates every generated spec from scratch:
//   recordings/*.json                      committed recordings of the demo app
//   tmp/full-loop/create-deal.json          what the full-loop test just recorded (if present)
// A recording's synthetic data lives next to it as <name>.data.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';

const OUT = { playwright: 'e2e/generated', cypress: 'cypress/e2e/generated' };
const FULL_LOOP = { file: 'tmp/full-loop/create-deal.json', data: 'e2e/full-loop/create-deal.data.json', name: 'Full loop create deal' };

const jobs = readdirSync('recordings')
  .filter((f) => f.endsWith('.json') && !f.endsWith('.data.json'))
  .map((f) => {
    const stem = basename(f, '.json');
    const data = join('recordings', `${stem}.data.json`);
    return { file: join('recordings', f), data: existsSync(data) ? data : undefined, name: stem.replace(/\.devtools$/, '').replace(/-/g, ' ') };
  });

if (existsSync(FULL_LOOP.file)) jobs.push(FULL_LOOP);
else console.warn(`! ${FULL_LOOP.file} not found; run "npm run e2e:full-loop" first to include it.`);

for (const dir of Object.values(OUT)) rmSync(dir, { recursive: true, force: true });

for (const job of jobs) {
  const args = ['tsx', 'tools/session-gen/cli.ts', job.file, '--name', job.name, '--playwright-out', OUT.playwright, '--cypress-out', OUT.cypress];
  if (job.data) args.push('--data', job.data);
  execFileSync('npx', args, { stdio: 'inherit' });
}
