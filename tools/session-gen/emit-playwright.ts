import type { ActionStep, Step, TestPlan } from './normalize';
import { dataBlock, header, pathRegex, str, urlExpr, valueExpr } from './emit-utils';

export function emitPlaywright(plan: TestPlan, keys: Map<string, string>, source: string): string {
  const tid = (id: string) => `page.getByTestId(T.${keys.get(id)})`;
  const loc = (s: ActionStep) => tid(s.target) + (s.inner ? `.locator(${str(s.inner)})` : '');

  const call = (s: ActionStep): string => {
    switch (s.kind) {
      case 'click': return `${loc(s)}.click()`;
      case 'fill': return `${loc(s)}.fill(${valueExpr(s.value)})`;
      case 'select': return `${loc(s)}.selectOption(${valueExpr(s.value)})`;
      case 'check': return `${loc(s)}.${s.checked ? 'check' : 'uncheck'}()`;
      case 'press': return `${loc(s)}.press(${str(s.key)})`;
    }
  };

  const lines = (s: Step): string[] => {
    switch (s.kind) {
      case 'goto': return [`await page.goto(${urlExpr(s.parts)});`];
      case 'expectPath': return [`await expect(page).toHaveURL(${pathRegex(s.path, 'url')});`];
      case 'expectVisible': return [`await expect(${tid(s.target)}).toBeVisible();`];
      case 'expectText': return [`await expect(${tid(s.target)}).toContainText(${str(s.text)});`];
      default:
        if (s.waits.length === 0) return [`await ${call(s)};`];
        // Arm the response waits before acting, or a fast response is missed.
        return [
          'await Promise.all([',
          ...s.waits.map((w) => `  response(page, ${str(w.method)}, ${pathRegex(w.path, 'pathname')}),`),
          `  ${call(s)},`,
          ']);',
        ];
    }
  };

  const out = [
    ...header(plan, source),
    `// Requires use.testIdAttribute = ${str(plan.meta.attribute)} in playwright.config.ts.`,
    `import { test, expect${plan.waits.length ? ', type Page' : ''} } from '@playwright/test';`,
    `import { T } from './selectors';`,
    '',
    ...dataBlock(plan),
  ];
  if (plan.waits.length) {
    out.push(
      'const response = (page: Page, method: string, path: RegExp) =>',
      '  page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname));',
      '',
    );
  }
  out.push(`test(${str(plan.name)}, async ({ page }) => {`);
  if (plan.meta.viewport) out.push(`  // Recorded at ${plan.meta.viewport.width}x${plan.meta.viewport.height}`);
  for (const section of plan.sections) {
    out.push(`  await test.step(${str(`On ${section.route}`)}, async () => {`);
    for (const step of section.steps) out.push(...lines(step).map((l) => `    ${l}`));
    out.push('  });');
  }
  out.push('});', '');
  return out.join('\n');
}
