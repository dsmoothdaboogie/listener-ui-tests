// Fails if either copy unit imports something a team wouldn't get by copying the folders.
//   src/app/session-recorder/  @angular/*, rxjs, its own files (+ @testing-library/* in specs)
//   tools/session-gen/         node:*, its own files, and exactly recorder.model.ts and
//                              url-pattern.ts from the recorder (+ vitest in specs)
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMPORT =
  /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[\s;])import\s*['"]([^'"]+)['"]/g;
const SOURCE = /\.(?:[cm]?[jt]s|tsx|jsx)$/;

export const UNITS = [
  {
    dir: 'src/app/session-recorder',
    packages: [/^@angular\//, /^rxjs(\/|$)/],
    specPackages: [/^@testing-library\//],
    externalFiles: [],
  },
  {
    dir: 'tools/session-gen',
    packages: [/^node:/],
    specPackages: [/^vitest$/],
    externalFiles: ['src/app/session-recorder/recorder.model', 'src/app/session-recorder/url-pattern'],
  },
];

export function importsOf(source) {
  return [...source.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? m[3]);
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (SOURCE.test(entry.name)) yield path;
  }
}

/** Returns one message per disallowed import; empty when the units are clean. */
export function checkBoundaries(root, units = UNITS) {
  const violations = [];
  for (const unit of units) {
    const unitDir = resolve(root, unit.dir);
    for (const file of sourceFiles(unitDir)) {
      const isSpec = /\.spec\.[cm]?[jt]s$/.test(file);
      for (const spec of importsOf(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('.')) {
          const target = resolve(dirname(file), spec).replace(/\.[cm]?[jt]s$/, '');
          const inside = !relative(unitDir, target).startsWith('..');
          const allowedExternal = unit.externalFiles.some((f) => resolve(root, f) === target);
          if (inside || allowedExternal) continue;
        } else if ([...unit.packages, ...(isSpec ? unit.specPackages : [])].some((re) => re.test(spec))) {
          continue;
        }
        violations.push(`${relative(root, file)}: imports "${spec}", which is outside ${unit.dir}'s copy boundary`);
      }
    }
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkBoundaries(process.cwd());
  violations.forEach((v) => console.error(`✗ ${v}`));
  if (violations.length) process.exit(1);
  console.log('✓ copy units import only what they are allowed to');
}
