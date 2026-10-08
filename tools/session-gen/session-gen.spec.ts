import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitCypress } from './emit-cypress';
import { emitPlaywright } from './emit-playwright';
import { emitSelectors } from './emit-selectors';
import { checkData, selectorKeys } from './emit-utils';
import { normalize } from './normalize';

const fixture = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
const snap = (name: string) => join(__dirname, '__snapshots__', name);

describe.each([
  ['sample-recording.json', 'Create deal'],
  ['devtools-recording.json', 'Open new deal'],
])('%s', (file, name) => {
  const plan = normalize(fixture(file), name);
  const keys = selectorKeys(plan.targets);
  const base = file.replace(/\.json$/, '');

  it('normalizes to the expected plan', async () => {
    await expect(JSON.stringify(plan, null, 2) + '\n').toMatchFileSnapshot(snap(`${base}.plan.json`));
  });

  it('emits Playwright', async () => {
    await expect(emitPlaywright(plan, keys, file)).toMatchFileSnapshot(snap(`${base}.spec.ts.snap`));
  });

  it('emits Cypress', async () => {
    await expect(emitCypress(plan, keys, file)).toMatchFileSnapshot(snap(`${base}.cy.ts.snap`));
  });

  it('emits selectors', async () => {
    await expect(emitSelectors(plan, keys, file)).toMatchFileSnapshot(snap(`${base}.selectors.ts.snap`));
  });
});

describe('normalize', () => {
  it('rejects input that is not a user flow', () => {
    expect(() => normalize({ title: 'x' }, 'x')).toThrow(/no steps array/);
  });

  it('turns masked fields into placeholders, never literals', () => {
    const plan = normalize(fixture('sample-recording.json'), 'x');
    expect(plan.placeholders.map((p) => p.key)).toContain('counterpartyTaxId');
    expect(emitCypress(plan, selectorKeys(plan.targets), 'x')).toContain('.type(data.counterpartyTaxId');
  });

  it('turns :id segments of support-mode navigations into path placeholders', () => {
    const flow = {
      steps: [
        { type: 'customStep', name: 'x-rec/session', parameters: { schemaVersion: 2, mode: 'support', attribute: 'data-testid', maskedTestIds: [] } },
        { type: 'navigate', url: 'https://app.example/deals/:id' },
      ],
    };
    const plan = normalize(flow, 'x');
    expect(plan.placeholders).toEqual([{ key: 'pathParam1', hint: 'id segment in /deals/:id' }]);
    expect(emitPlaywright(plan, selectorKeys(plan.targets), 'x')).toContain('await page.goto(`/deals/${data.pathParam1}`);');
  });
});

describe('--data', () => {
  const plan = normalize(fixture('sample-recording.json'), 'x');
  const keys = selectorKeys(plan.targets);

  it('fills supplied placeholders in both frameworks and drops the TODO', () => {
    const data = { counterpartyTaxId: '000000001' };
    for (const out of [emitCypress(plan, keys, 'x', data), emitPlaywright(plan, keys, 'x', data)]) {
      expect(out).toContain('counterpartyTaxId: "000000001",');
      expect(out).not.toContain('TODO');
    }
  });

  it('leaves missing placeholders empty with their TODO', () => {
    expect(emitCypress(plan, keys, 'x', {})).toContain(`counterpartyTaxId: '', // TODO: masked at capture (9 chars)`);
  });

  it('rejects keys that are not placeholders in the recording', () => {
    expect(() => checkData(plan, { counterpartyTaxID: '1' })).toThrow(/unknown key\(s\): counterpartyTaxID.*counterpartyTaxId/);
  });
});
