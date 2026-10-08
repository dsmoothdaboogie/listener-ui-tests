import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Records the "create deal" flow with the real recorder and saves the download where
 * `npm run e2e:generate` picks it up. The generated specs then prove the whole loop:
 * recorder -> recording -> session-gen -> passing Cypress and Playwright specs.
 */
// Outside test-results/, which Playwright empties at the start of every run.
const FULL_LOOP_OUTPUT = 'tmp/full-loop/create-deal.json';

test('records the create-deal flow', async ({ page }) => {
  await page.goto('/deals?rec=on');
  await expect(page.getByRole('status')).toContainText('Recording');
  await expect(page).toHaveURL(/\/deals$/); // ?rec=on is stripped from the address bar

  await page.getByTestId('new-deal').click();
  await expect(page).toHaveURL(/\/deals\/new$/);

  await page.getByTestId('deal-name').locator('input').click();
  await page.getByTestId('deal-name').locator('input').pressSequentially('Acme bridge loan');
  await page.getByTestId('counterparty-tax-id').locator('input').fill('123456789');
  await page.getByTestId('approval-pin').locator('input').fill('4321');
  await page.getByTestId('deal-currency').selectOption('EUR');
  await page.getByTestId('deal-desk').click();
  await page.getByTestId('deal-desk-option-dcm').click();
  await page.getByTestId('deal-close-date').locator('input').fill('10/15/2026');
  await page.getByTestId('deal-confidential').locator('input').check();
  await page.getByRole('button', { name: 'Help' }).click(); // untagged on purpose
  await page.getByTestId('save-deal').click();

  await expect(page).toHaveURL(/\/deals\/\d+$/);
  await expect(page.getByTestId('deal-status')).toHaveText('Draft');
  await page.keyboard.press('Alt+Shift+A');
  await page.getByTestId('deal-status').click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Stop and save' }).click();
  mkdirSync(dirname(FULL_LOOP_OUTPUT), { recursive: true });
  await (await download).saveAs(FULL_LOOP_OUTPUT);

  const flow = JSON.parse(readFileSync(FULL_LOOP_OUTPUT, 'utf8'));
  const json = JSON.stringify(flow);
  const session = flow.steps[0].parameters;

  // The values typed into masked fields must never reach the file.
  expect(json).not.toContain('123456789');
  expect(json).not.toContain('4321');
  expect(session.maskedTestIds).toEqual(expect.arrayContaining(['counterparty-tax-id', 'approval-pin']));
  expect(session.skippedInteractions).toBe(1);
  // Test mode keeps ordinary values and assertion text.
  expect(json).toContain('Acme bridge loan');
  expect(flow.steps.at(-1)).toMatchObject({ type: 'waitForElement', 'x-rec': { testId: 'deal-status', expectText: 'Draft' } });
});
