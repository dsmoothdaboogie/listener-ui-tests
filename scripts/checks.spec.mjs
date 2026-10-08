import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { UNITS, checkBoundaries, importsOf } from './check-boundaries.mjs';
import { checkProdMode } from './check-prod-mode.mjs';

describe('check-boundaries', () => {
  let root;
  const write = (path, body) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };
  const fresh = () => {
    root = mkdtempSync(join(tmpdir(), 'boundaries-'));
    write('src/app/session-recorder/a.ts', `import { inject } from '@angular/core';\nimport { map } from 'rxjs/operators';\nimport { b } from './b';`);
    write('src/app/session-recorder/a.spec.ts', `import { render } from '@testing-library/angular';`);
    write('tools/session-gen/cli.ts', `import { x } from '../../src/app/session-recorder/recorder.model';\nimport { readFileSync } from 'node:fs';`);
    write('tools/session-gen/x.spec.ts', `import { it } from 'vitest';`);
  };
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));

  it('passes the real repo', () => {
    expect(checkBoundaries(process.cwd())).toEqual([]);
  });

  it('passes a clean fixture', () => {
    fresh();
    expect(checkBoundaries(root, UNITS)).toEqual([]);
  });

  it.each([
    ['src/app/session-recorder/c.ts', `import { Deal } from '../demo/deal.model';`, '../demo/deal.model'],
    ['src/app/session-recorder/c.ts', `import { Store } from '@ngrx/store';`, '@ngrx/store'],
    ['src/app/session-recorder/c.ts', `import { render } from '@testing-library/angular';`, '@testing-library/angular'],
    ['src/app/session-recorder/c.ts', `const m = import('lodash');`, 'lodash'],
    ['tools/session-gen/y.ts', `import { SessionRecorder } from '../../src/app/session-recorder/session-recorder.service';`, 'session-recorder.service'],
    ['tools/session-gen/y.ts', `import chalk from 'chalk';`, 'chalk'],
    ['tools/session-gen/y.ts', `import fs = require('fs-extra');`, 'fs-extra'],
    ['tools/session-gen/y.mts', `import chalk from 'chalk';`, 'chalk'],
    ['src/app/session-recorder/c.js', `const x = require('lodash');`, 'lodash'],
  ])('flags %s importing a disallowed module', (file, body, needle) => {
    fresh();
    write(file, body);
    const violations = checkBoundaries(root, UNITS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(needle);
  });

  it('finds static, re-export, dynamic and side-effect imports', () => {
    expect(
      importsOf(`import a from 'a';\nexport * from './b';\nimport('c');\nimport 'd';\nimport type { E } from 'e';\nimport f = require('f');`),
    ).toEqual(['a', './b', 'c', 'd', 'e', 'f']);
  });
});

describe('check-prod-mode', () => {
  it('passes when recorderMode is unset or support', () => {
    expect(checkProdMode(`export const environment = { name: 'prod' };`)).toEqual([]);
    expect(checkProdMode(`export const environment = { recorderMode: 'support' };`)).toEqual([]);
  });

  it.each([`recorderMode: 'test'`, `recorderMode:"test"`, 'recorderMode : `test`'])('fails on %s', (line) => {
    expect(checkProdMode(`export const environment = { ${line} };`)).toHaveLength(1);
  });
});
