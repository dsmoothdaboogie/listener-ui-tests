import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FlowStep } from './recorder.model';
import { RECORDER_CONFIG, SessionRecorderConfig, resolveRecorderConfig } from './recorder.tokens';
import { SessionRecorder } from './session-recorder.service';

async function startRecorder(overrides: Partial<SessionRecorderConfig> = {}): Promise<SessionRecorder> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: RECORDER_CONFIG,
        useValue: resolveRecorderConfig({ mode: 'test', appVersion: 't', environment: 't', canRecord: () => true, ...overrides }),
      },
    ],
  });
  const rec = TestBed.inject(SessionRecorder);
  await rec.requestStart();
  return rec;
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

function type(el: HTMLInputElement, text: string): void {
  for (const ch of text) {
    el.value += ch;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

describe('SessionRecorder', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
    sessionStorage.clear();
  });

  it('writes a DevTools user flow with our session step first', async () => {
    const flow = (await startRecorder()).snapshot();
    expect(flow.selectorAttribute).toBe('data-testid');
    expect(flow.steps.map((s) => s.type)).toEqual(['customStep', 'setViewport', 'navigate']);
  });

  it('drops the focus click, collapses keystrokes, and targets the inner control', async () => {
    document.body.innerHTML = `
      <div data-testid="deal-name"><input id="name" /></div>
      <button data-testid="save-deal"><span id="label">Save</span></button>`;
    const rec = await startRecorder();
    const input = document.getElementById('name') as HTMLInputElement;
    input.click();
    type(input, 'Acme');
    document.getElementById('label')!.click();

    expect(body(rec)).toEqual([
      {
        type: 'change',
        target: 'main',
        selectors: [['[data-testid="deal-name"] input']],
        value: 'Acme',
        'x-rec': { route: '/', testId: 'deal-name', inner: 'input' },
      },
      { type: 'click', target: 'main', selectors: [['[data-testid="save-deal"]']], 'x-rec': { route: '/', testId: 'save-deal' } },
    ]);
  });

  it('masks values in support mode and lists the field in session metadata', async () => {
    document.body.innerHTML = `<input data-testid="tax-id" id="t" /><button data-testid="go">Go</button>`;
    const rec = await startRecorder({ mode: 'support' });
    type(document.getElementById('t') as HTMLInputElement, '123456789');
    (document.querySelector('button') as HTMLButtonElement).click();
    const flow = rec.snapshot();
    expect(flow.steps[3]).toMatchObject({ type: 'change', value: '', 'x-rec': { masked: { length: 9 } } });
    expect(flow.steps[0]).toMatchObject({ type: 'customStep', parameters: { maskedTestIds: ['tax-id'] } });
    expect(JSON.stringify(flow)).not.toContain('123456789');
  });

  it('records Enter as a keyDown/keyUp pair', async () => {
    document.body.innerHTML = `<input data-testid="search" id="s" />`;
    const rec = await startRecorder();
    const input = document.getElementById('s') as HTMLInputElement;
    type(input, 'Acme');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(body(rec).map((s) => s.type)).toEqual(['change', 'keyDown', 'keyUp']);
  });

  it('refuses to start without entitlement', async () => {
    const rec = await startRecorder({ canRecord: () => false });
    expect(rec.active()).toBe(false);
  });

  it('counts untagged interactive elements instead of recording them', async () => {
    document.body.innerHTML = `<button id="b">Untagged</button>`;
    const rec = await startRecorder({ mode: 'support' });
    document.getElementById('b')!.click();
    expect(rec.stepCount()).toBe(0);
    expect(rec.skippedCount()).toBe(1);
  });

  it('turns an armed click into a waitForElement check and swallows it', async () => {
    document.body.innerHTML = `<button data-testid="status">Draft</button>`;
    const rec = await startRecorder();
    const onClick = jest.fn();
    document.querySelector('button')!.addEventListener('click', onClick);
    rec.togglePicking();
    document.querySelector('button')!.click();
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
});
