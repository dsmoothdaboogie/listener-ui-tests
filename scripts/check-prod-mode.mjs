// Fails if the production environment opts the recorder into test mode, which captures
// field values and on-screen text. Production must leave recorderMode unset (support mode).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PROD_ENV = 'src/environments/environment.prod.ts';
const TEST_MODE = /recorderMode\s*:\s*['"`]test['"`]/;

export function checkProdMode(source) {
  return TEST_MODE.test(source) ? [`${PROD_ENV} sets recorderMode: 'test'; production must use support mode`] : [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkProdMode(readFileSync(process.argv[2] ?? PROD_ENV, 'utf8'));
  violations.forEach((v) => console.error(`✗ ${v}`));
  if (violations.length) process.exit(1);
  console.log('✓ production build leaves the recorder in support mode');
}
