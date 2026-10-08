import type { TestPlan } from './normalize';
import { header, str } from './emit-utils';

export function emitSelectors(plan: TestPlan, keys: Map<string, string>, source: string): string {
  return [
    ...header(plan, source),
    '',
    `export const TEST_ID_ATTR = ${str(plan.meta.attribute)};`,
    '',
    'export const T = {',
    ...[...keys].map(([id, key]) => `  ${key}: ${str(id)},`),
    '} as const;',
    '',
  ].join('\n');
}
