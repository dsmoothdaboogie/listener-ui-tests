import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import type { FlowStep } from './recorder.model';
import { RECORDER_CONFIG, SessionRecorderConfig, resolveRecorderConfig } from './recorder.tokens';
import { SessionRecorder } from './session-recorder.service';

@Component({ template: '' })
class Blank {}

/** One page that covers every control the recorder distinguishes. */
@Component({
  selector: 'rec-test-page',
  template: `
    <div data-testid="deal-name"><input aria-label="Deal name" /></div>
    <section data-rec-mask>
      <input data-testid="tax-id" aria-label="Tax id" />
    </section>
    <input data-testid="pin" type="password" aria-label="PIN" />
    <select data-testid="currency" aria-label="Currency">
      <option>USD</option>
      <option>EUR</option>
    </select>
    <label data-testid="confidential"><input type="checkbox" /> Confidential</label>
    <input data-testid="search" aria-label="Search" />
    <button data-testid="save" (click)="go()">Save</button>
    <button data-testid="noop">Noop</button>
    <button>Untagged</button>
    <p data-testid="status">Draft</p>
  `,
})
class TestPage {
  private readonly router = inject(Router);
  go(): void {
    void this.router.navigateByUrl('/deals/10042');
  }
}

async function setup(overrides: Partial<SessionRecorderConfig> = {}) {
  await render(TestPage, {
    providers: [
      provideRouter([{ path: 'deals/:id', component: Blank }]),
      {
        provide: RECORDER_CONFIG,
        useValue: resolveRecorderConfig({ mode: 'test', appVersion: 't', environment: 't', canRecord: () => true, ...overrides }),
      },
    ],
  });
  const rec = TestBed.inject(SessionRecorder);
  await rec.requestStart();
  return { rec, user: userEvent.setup() };
}

/** Steps after the session/viewport/navigate header, without timing noise. */
function body(rec: SessionRecorder): Partial<FlowStep>[] {
  return rec.snapshot().steps.slice(3).map((s) => {
    const copy = JSON.parse(JSON.stringify(s));
    delete copy['x-rec']?.t;
    delete copy.offsetX;
    delete copy.offsetY;
    return copy;
  });
}

const settle = () => new Promise((r) => setTimeout(r));

describe('SessionRecorder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('writes a DevTools user flow with our session step first', async () => {
    const { rec } = await setup();
    const flow = rec.snapshot();
    expect(flow.selectorAttribute).toBe('data-testid');
    expect(flow.steps.map((s) => s.type)).toEqual(['customStep', 'setViewport', 'navigate']);
  });

  it('collapses typing into one change and drops the click that only focused the field', async () => {
    const { rec, user } = await setup();
    await user.click(screen.getByLabelText('Deal name'));
    await user.type(screen.getByLabelText('Deal name'), 'Acme');
    await user.click(screen.getByTestId('noop'));

    expect(body(rec)).toEqual([
      {
        type: 'change',
        target: 'main',
        selectors: [['[data-testid="deal-name"] input']],
        value: 'Acme',
        'x-rec': { route: '/', testId: 'deal-name', inner: 'input' },
      },
      { type: 'click', target: 'main', selectors: [['[data-testid="noop"]']], 'x-rec': { route: '/', testId: 'noop' } },
    ]);
  });

  it('drops every focus click before typing and keeps the requests they triggered', async () => {
    const { rec, user } = await setup();
    const input = screen.getByLabelText('Deal name');
    await user.click(input);
    rec.trackRequest('GET', '/api/suggestions/42')!(200);
    await user.click(input);
    rec.trackRequest('GET', '/api/suggestions/42')!(200);
    rec.trackRequest('GET', '/api/limits')!(200);
    await user.type(input, 'Acme', { skipClick: true });
    await user.click(screen.getByTestId('noop'));

    const [change, ...rest] = body(rec);
    expect(change).toMatchObject({ type: 'change', value: 'Acme' });
    expect(change['x-rec']?.network).toEqual([
      { method: 'GET', urlPattern: '/api/suggestions/*', status: 200 },
      { method: 'GET', urlPattern: '/api/limits', status: 200 },
    ]);
    expect(rest.map((s) => s['x-rec']?.testId)).toEqual(['noop']);
  });

  it('keeps both clicks when a checkbox is toggled on and then off', async () => {
    const { rec, user } = await setup();
    await user.click(screen.getByText('Confidential'));
    await user.click(screen.getByText('Confidential'));

    expect(body(rec).map((s) => s['x-rec']?.checked)).toEqual([true, false]);
  });

  it.each([
    ['a field inside data-rec-mask', 'Tax id', 'tax-id'],
    ['a password field', 'PIN', 'pin'],
  ])('masks %s, even in test mode', async (_, label, testId) => {
    const { rec, user } = await setup();
    await user.type(screen.getByLabelText(label), '123456789');
    await user.click(screen.getByTestId('noop'));

    const flow = rec.snapshot();
    expect(flow.steps[3]).toMatchObject({ type: 'change', value: '', 'x-rec': { testId, masked: { length: 9 } } });
    expect(flow.steps[0]).toMatchObject({ parameters: { maskedTestIds: [testId] } });
    expect(JSON.stringify(flow)).not.toContain('123456789');
  });

  it('records a native select as a change with control "select"', async () => {
    const { rec, user } = await setup();
    await user.selectOptions(screen.getByLabelText('Currency'), 'EUR');

    expect(body(rec).filter((s) => s.type === 'change')).toEqual([
      {
        type: 'change',
        target: 'main',
        selectors: [['[data-testid="currency"]']],
        value: 'EUR',
        'x-rec': { route: '/', testId: 'currency', control: 'select' },
      },
    ]);
  });

  it('records a checkbox as one click on the wrapper with its final state', async () => {
    const { rec, user } = await setup();
    await user.click(screen.getByRole('checkbox'));

    expect(body(rec)).toEqual([
      {
        type: 'click',
        target: 'main',
        selectors: [['[data-testid="confidential"]']],
        'x-rec': { route: '/', testId: 'confidential', inner: 'input[type="checkbox"]', checked: true },
      },
    ]);
  });

  it('records Enter in a text field as keyDown/keyUp, but Enter on a button only as its click', async () => {
    const { rec, user } = await setup();
    await user.type(screen.getByLabelText('Search'), 'Acme{Enter}');
    screen.getByTestId('noop').focus();
    await user.keyboard('{Enter}');

    expect(body(rec).map((s) => s.type)).toEqual(['change', 'keyDown', 'keyUp', 'click']);
  });

  it('asserts a route change on the action that caused it', async () => {
    const { rec, user } = await setup();
    await user.click(screen.getByTestId('save'));
    await settle();

    const [save] = body(rec);
    expect(save).toMatchObject({
      type: 'click',
      assertedEvents: [{ type: 'navigation', url: `${location.origin}/deals/10042` }],
    });
  });

  it('records a route change more than 4s after the last action as its own navigate step', async () => {
    const { rec, user } = await setup();
    await user.click(screen.getByTestId('noop'));
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 5000);
    await TestBed.inject(Router).navigateByUrl('/deals/10042');

    expect(body(rec).map((s) => s.type)).toEqual(['click', 'navigate']);
  });

  it('captures no values and no assertion text in support mode', async () => {
    const { rec, user } = await setup({ mode: 'support' });
    await user.type(screen.getByLabelText('Deal name'), 'Acme');
    await user.selectOptions(screen.getByLabelText('Currency'), 'EUR');
    rec.togglePicking();
    await user.click(screen.getByTestId('status'));

    const flow = rec.snapshot();
    const json = JSON.stringify(flow);
    expect(json).not.toContain('Acme');
    expect(json).not.toContain('EUR');
    expect(json).not.toContain('Draft');
    expect(flow.steps.at(-1)).toMatchObject({ type: 'waitForElement', 'x-rec': { testId: 'status' } });
  });

  it('counts untagged interactive elements instead of recording them', async () => {
    const { rec, user } = await setup({ mode: 'support' });
    await user.click(screen.getByRole('button', { name: 'Untagged' }));
    expect(rec.stepCount()).toBe(0);
    expect(rec.skippedCount()).toBe(1);
  });

  it('turns Alt+Shift+A then a click into a waitForElement check, and the app never sees the click', async () => {
    const { rec, user } = await setup();
    const onClick = vi.fn();
    screen.getByTestId('status').addEventListener('click', onClick);
    await user.keyboard('{Alt>}{Shift>}A{/Shift}{/Alt}');
    expect(rec.picking()).toBe(true);
    await user.click(screen.getByTestId('status'));

    expect(onClick).not.toHaveBeenCalled();
    expect(body(rec)).toEqual([
      {
        type: 'waitForElement',
        target: 'main',
        selectors: [['[data-testid="status"]']],
        visible: true,
        'x-rec': { route: '/', testId: 'status', expectText: 'Draft' },
      },
    ]);
  });

  it('refuses to start without entitlement', async () => {
    const { rec } = await setup({ canRecord: () => false });
    expect(rec.active()).toBe(false);
  });
});
