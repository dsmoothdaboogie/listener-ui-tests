/**
 * session-gen: DevTools Recorder user flow (ours or Chrome's) -> Playwright and Cypress specs.
 *
 *   npx tsx tools/session-gen/cli.ts recordings/create-deal.json --name "Create deal"
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { emitCypress } from './emit-cypress';
import { emitPlaywright } from './emit-playwright';
import { emitSelectors } from './emit-selectors';
import { GENERATED_MARK, type PlanData, checkData, selectorKeys } from './emit-utils';
import { normalize } from './normalize';

const USAGE = `Usage: session-gen <user-flow.json>... [options]
  --name <text>            Test name (single recording only). Default: file name.
  --data <file.json>       Values for the spec's data placeholders (single recording only)
  --targets <list>         playwright,cypress (default both)
  --playwright-out <dir>   Default e2e/generated
  --cypress-out <dir>      Default cypress/e2e/generated
  --force                  Overwrite generated files even if they were edited`;

function main(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      data: { type: 'string' },
      targets: { type: 'string', default: 'playwright,cypress' },
      'playwright-out': { type: 'string', default: 'e2e/generated' },
      'cypress-out': { type: 'string', default: 'cypress/e2e/generated' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help || positionals.length === 0) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }
  if ((values.name || values.data) && positionals.length > 1) {
    console.error('--name and --data can only be used with a single recording.');
    return 1;
  }
  const data = values.data ? loadData(values.data) : {};
  const targets = new Set(values.targets.split(',').map((t) => t.trim()));
  const unknownTargets = [...targets].filter((t) => t !== 'playwright' && t !== 'cypress');
  if (unknownTargets.length || targets.size === 0) {
    console.error(`--targets accepts playwright and cypress; got "${values.targets}".`);
    return 1;
  }
  let ok = true;

  for (const file of positionals) {
    const session = load(file);
    const name = values.name ?? basename(file).replace(/\.json$/i, '');
    const slug = slugify(name);
    const plan = normalize(session, name);
    checkData(plan, data);
    const keys = selectorKeys(plan.targets);
    const source = basename(file);
    const selectors = emitSelectors(plan, keys, source);

    if (targets.has('playwright')) {
      ok = write(join(values['playwright-out'], slug), {
        'selectors.ts': selectors,
        [`${slug}.spec.ts`]: emitPlaywright(plan, keys, source, data),
      }, values.force) && ok;
    }
    if (targets.has('cypress')) {
      ok = write(join(values['cypress-out'], slug), {
        'selectors.ts': selectors,
        [`${slug}.cy.ts`]: emitCypress(plan, keys, source, data),
      }, values.force) && ok;
    }

    const steps = plan.sections.reduce((n, s) => n + s.steps.length, 0);
    console.log(`✓ ${source} -> ${slug}: ${steps} steps, ${plan.waits.length} response waits, ${plan.targets.length} selectors`);
    const unfilled = plan.placeholders.filter((p) => !(p.key in data));
    if (unfilled.length) console.log(`  ! ${unfilled.length} value(s) to fill in: ${unfilled.map((p) => p.key).join(', ')}`);
    plan.notes.forEach((n) => console.log(`  ! ${n}`));
  }
  return ok ? 0 : 1;
}

function load(file: string): unknown {
  if (!existsSync(file)) throw new Error(`${file} not found.`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${err instanceof Error ? err.message : err}`);
  }
}

function loadData(file: string): PlanData {
  const data = load(file);
  const ok =
    data !== null && typeof data === 'object' && !Array.isArray(data) && Object.values(data).every((v) => typeof v === 'string' && v !== '');
  if (!ok) throw new Error(`${file} must be a JSON object of non-empty string values, keyed by placeholder name.`);
  return data as PlanData;
}

const hash = (body: string) => createHash('sha256').update(body).digest('hex').slice(0, 12);

/** Writes generated files, refusing to clobber any that were edited since generation. */
function write(dir: string, files: Record<string, string>, force: boolean): boolean {
  mkdirSync(dir, { recursive: true });
  let ok = true;
  for (const [name, body] of Object.entries(files)) {
    const path = join(dir, name);
    if (existsSync(path) && !force) {
      const existing = readFileSync(path, 'utf8');
      const nl = existing.indexOf('\n');
      const match = existing.slice(0, nl).match(/\[([0-9a-f]{12})\]$/);
      if (!existing.startsWith(GENERATED_MARK) || !match || match[1] !== hash(existing.slice(nl + 1))) {
        console.error(`✗ ${path} was edited after generation; not overwriting (use --force, or promote it first).`);
        ok = false;
        continue;
      }
    }
    writeFileSync(path, `${GENERATED_MARK} [${hash(body)}]\n${body}`);
  }
  return ok;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recording';

try {
  process.exitCode = main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
