import { TestBed } from '@angular/core/testing';
import { CapturePolicy } from './capture-policy';
import { RECORDER_CONFIG, SessionRecorderConfig, resolveRecorderConfig } from './recorder.tokens';

function policyWith(overrides: Partial<SessionRecorderConfig> = {}): CapturePolicy {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: RECORDER_CONFIG,
        useValue: resolveRecorderConfig({ appVersion: 't', environment: 't', canRecord: () => true, ...overrides }),
      },
    ],
  });
  return TestBed.inject(CapturePolicy);
}

function field(value: string, attrs: Record<string, string> = {}): HTMLInputElement {
  const el = document.createElement('input');
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  el.value = value;
  document.body.appendChild(el);
  return el;
}

describe('CapturePolicy', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
  });

  it('defaults to support mode and masks values', () => {
    expect(policyWith().fieldCapture(field('Acme'), 'deal-name')).toEqual({ kind: 'masked', length: 4 });
  });

  it('captures values in test mode', () => {
    expect(policyWith({ mode: 'test' }).fieldCapture(field('Acme'), 'deal-name')).toEqual({ kind: 'value', value: 'Acme' });
  });

  it.each([
    [{ type: 'password' }],
    [{ type: 'hidden' }],
    [{ autocomplete: 'cc-number' }],
    [{ autocomplete: 'billing one-time-code' }],
  ])('never captures %j, even in test mode', (attrs) => {
    expect(policyWith({ mode: 'test' }).fieldCapture(field('secret', attrs), 'x').kind).toBe('masked');
  });

  it('honours data-rec-mask on an ancestor', () => {
    const wrap = document.createElement('section');
    wrap.setAttribute('data-rec-mask', '');
    const el = field('123-456-789');
    wrap.appendChild(el);
    document.body.appendChild(wrap);
    expect(policyWith({ mode: 'test' }).fieldCapture(el, 'tax-id').kind).toBe('masked');
  });

  it('honours the test-mode alwaysMask list', () => {
    expect(policyWith({ mode: 'test', alwaysMask: ['tax-id'] }).fieldCapture(field('1'), 'tax-id').kind).toBe('masked');
  });

  it('captures only allow-listed fields in support mode', () => {
    const p = policyWith({ mode: 'support', supportValueAllowList: ['deal-currency'] });
    expect(p.fieldCapture(field('USD'), 'deal-currency').kind).toBe('value');
    expect(p.fieldCapture(field('Acme'), 'deal-name').kind).toBe('masked');
  });

  it('hides assertion text in support mode', () => {
    const el = document.createElement('div');
    el.textContent = 'Balance 1,204,000.00';
    expect(policyWith().assertionText(el)).toBeUndefined();
  });

  it('keeps assertion text in test mode', () => {
    const el = document.createElement('div');
    el.textContent = '  Draft \n ';
    expect(policyWith({ mode: 'test' }).assertionText(el)).toBe('Draft');
  });

  it('keeps no query strings or ids in support-mode URLs', () => {
    expect(policyWith().navigationUrl('/deals/88213/tranches?acct=4417#x')).toBe('/deals/:id/tranches');
  });

  it('keeps real path ids in test mode so navigation can be replayed', () => {
    expect(policyWith({ mode: 'test' }).navigationUrl('/deals/88213?acct=4417')).toBe('/deals/88213');
  });
});
