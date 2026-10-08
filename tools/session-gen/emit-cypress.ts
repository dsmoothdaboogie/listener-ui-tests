import type { ActionStep, Step, TestPlan } from './normalize';
import { dataBlock, header, pathRegex, str, urlExpr, valueExpr } from './emit-utils';

const KEYS: Record<string, string> = { Enter: '{enter}', Escape: '{esc}' };

export function emitCypress(plan: TestPlan, keys: Map<string, string>, source: string): string {
  const get = (id: string) => `cy.get(tid(T.${keys.get(id)}))`;
  const loc = (s: ActionStep) => get(s.target) + (s.inner ? `.find(${str(s.inner)})` : '');
  // Custom controls usually hide the native input; force is needed to act on it.
  const force = (s: ActionStep) => (s.inner ? '{ force: true }' : '');

  const action = (s: ActionStep): string => {
    switch (s.kind) {
      case 'click': return `${loc(s)}.click();`;
      case 'fill':
        if ('literal' in s.value && s.value.literal === '') return `${loc(s)}.clear();`;
        return `${loc(s)}.clear().type(${valueExpr(s.value)}, { parseSpecialCharSequences: false });`;
      case 'select': return `${loc(s)}.select(${valueExpr(s.value)});`;
      case 'check': return `${loc(s)}.${s.checked ? 'check' : 'uncheck'}(${force(s)});`;
      case 'press': return `${loc(s)}.type(${str(KEYS[s.key] ?? s.key)});`;
    }
  };

  const lines = (s: Step): string[] => {
    switch (s.kind) {
      case 'goto': return [`cy.visit(${urlExpr(s.parts)});`];
      case 'expectPath': return [`cy.location('pathname').should('match', ${pathRegex(s.path, 'pathname')});`];
      case 'expectVisible': return [`${get(s.target)}.should('be.visible');`];
      case 'expectText': return [`${get(s.target)}.should('contain.text', ${str(s.text)});`];
      default: return [action(s), ...s.waits.map((w) => `cy.wait(${str('@' + w.alias)});`)];
    }
  };

  const out = [
    ...header(plan, source),
    `import { T, TEST_ID_ATTR } from './selectors';`,
    '',
    'const tid = (id: string) => `[${TEST_ID_ATTR}="${id}"]`;',
    '',
    ...dataBlock(plan),
    `describe(${str(plan.name)}, () => {`,
    `  it('replays the recorded flow', () => {`,
    ...(plan.meta.viewport ? [`    cy.viewport(${plan.meta.viewport.width}, ${plan.meta.viewport.height});`] : []),
    ...plan.waits.map(
      (w) => `    cy.intercept({ method: ${str(w.method)}, url: ${pathRegex(w.path, 'url')} }).as(${str(w.alias)});`,
    ),
  ];
  for (const section of plan.sections) {
    out.push('', `    // On ${section.route}`);
    for (const step of section.steps) out.push(...lines(step).map((l) => `    ${l}`));
  }
  out.push('  });', '});', '');
  return out.join('\n');
}
