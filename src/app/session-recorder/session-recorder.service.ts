import {
  DOCUMENT,
  DestroyRef,
  EnvironmentInjector,
  Injectable,
  NgZone,
  PLATFORM_ID,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, isObservable, take } from 'rxjs';
import { CapturePolicy } from './capture-policy';
import {
  RECORDER_UI_ATTR,
  cssString,
  innerSelector,
  interactiveAncestor,
  isNativeChoiceControl,
  isRecorderUi,
  isTextEntry,
  originOf,
} from './dom';
import {
  FlowStep,
  Selector,
  UserFlow,
  XREC,
  XREC_SESSION_STEP,
  XRecSession,
  XRecStep,
} from './recorder.model';
import { RECORDER_CONFIG } from './recorder.tokens';

type ActionStep = Extract<FlowStep, { type: 'click' | 'change' | 'keyDown' }>;

interface StoredState {
  flow: UserFlow;
  startedAtMs: number;
}

interface Hit {
  host: Element;
  id: string;
}

const STORAGE_KEY = '__session_recorder__';
const PERSIST_DELAY_MS = 250;
/** A route change this soon after an action is asserted on that action, DevTools-style. */
const NAV_CAUSAL_MS = 4000;
const ON = new Set(['on', '1', 'true', 'start']);
const OFF = new Set(['off', '0', 'false', 'stop']);

@Injectable({ providedIn: 'root' })
export class SessionRecorder {
  private readonly cfg = inject(RECORDER_CONFIG);
  private readonly policy = inject(CapturePolicy);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(EnvironmentInjector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly selector = `[${this.cfg.attribute}]:not([${this.cfg.attribute}=""])`;

  private readonly _active = signal(false);
  private readonly _count = signal(0);
  private readonly _skipped = signal(0);
  private readonly _picking = signal(false);
  private readonly _truncated = signal(false);

  readonly mode = this.cfg.mode;
  readonly active = this._active.asReadonly();
  readonly stepCount = this._count.asReadonly();
  readonly skippedCount = this._skipped.asReadonly();
  readonly picking = this._picking.asReadonly();
  readonly truncated = this._truncated.asReadonly();

  private flow: UserFlow | null = null;
  private session: XRecSession | null = null;
  private headerSteps = 0;
  private startedAtMs = 0;
  private lastAction: ActionStep | null = null;
  private readonly pendingFills = new Map<string, { hit: Hit; field: Element }>();
  private readonly skippedEls = new WeakSet<Element>();
  private detach: Array<() => void> = [];
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detachListeners());
  }

  /** Called once from the app initializer. Never blocks bootstrap. */
  init(): void {
    if (!this.isBrowser) return;
    const intent = this.consumeUrlIntent();
    if (intent === 'off') {
      this.reset();
      return;
    }
    const stored = this.readStored();
    if (intent !== 'on' && !stored) return;
    void this.authorize().then((ok) => (ok ? this.start(stored) : this.reset()));
  }

  /** For a dev menu or support console button, as an alternative to ?rec=on. */
  async requestStart(): Promise<boolean> {
    if (this._active()) return true;
    const ok = await this.authorize();
    if (ok) this.start(null);
    return ok;
  }

  togglePicking(): void {
    if (this._active()) this._picking.update((v) => !v);
  }

  stopAndSave(): void {
    if (this._count() > 0) this.download();
    this.reset();
  }

  discard(): void {
    this.reset();
  }

  /** The recording as a DevTools Recorder user flow. */
  snapshot(): UserFlow {
    if (!this.flow || !this.session) throw new Error('[session-recorder] not recording');
    this.flushFills();
    if (this._skipped() > 0) this.session.skippedInteractions = this._skipped();
    if (this._truncated()) this.session.truncated = true;
    return JSON.parse(JSON.stringify(this.flow)) as UserFlow;
  }

  download(): void {
    if (!this.flow || !this.session) return;
    const flow = this.snapshot();
    const href = URL.createObjectURL(new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' }));
    const a = this.doc.createElement('a');
    a.href = href;
    a.download = `recording-${this.session.mode}-${this.session.startedAt.replace(/[:.]/g, '-')}.json`;
    a.setAttribute(RECORDER_UI_ATTR, '');
    this.doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  /**
   * Called by the interceptor when a request starts. The request is attributed to
   * the most recent action; the returned callback records it once it settles.
   */
  trackRequest(method: string, url: string): ((status: number) => void) | null {
    const owner = this.lastAction?.[XREC];
    if (!this._active() || !owner || this.policy.ignoresRequest(url)) return null;
    const urlPattern = this.policy.requestPattern(url);
    return (status) => {
      const marks = (owner.network ??= []);
      if (marks.some((m) => m.method === method && m.urlPattern === urlPattern)) return;
      marks.push({ method, urlPattern, status });
      this.schedulePersist();
    };
  }

  // ---- lifecycle -----------------------------------------------------------

  private async authorize(): Promise<boolean> {
    try {
      const result = runInInjectionContext(this.injector, () => this.cfg.canRecord());
      if (isObservable(result)) return await firstValueFrom(result.pipe(take(1)), { defaultValue: false });
      return (await result) === true;
    } catch {
      return false;
    }
  }

  private start(stored: StoredState | null): void {
    if (this._active()) return;
    if (stored) {
      this.flow = stored.flow;
      this.startedAtMs = stored.startedAtMs;
      this.session = sessionOf(stored.flow)!;
      this._skipped.set(this.session.skippedInteractions ?? 0);
      this.lastAction = [...stored.flow.steps].reverse().find(isAction) ?? null;
    } else {
      this.startedAtMs = Date.now();
      this.session = {
        schemaVersion: 2,
        mode: this.cfg.mode,
        attribute: this.cfg.attribute,
        appVersion: this.cfg.appVersion,
        environment: this.cfg.environment,
        startedAt: new Date(this.startedAtMs).toISOString(),
        maskedTestIds: [],
      };
      const win = this.doc.defaultView!;
      const startUrl = this.absolute(this.policy.navigationUrl(win.location.pathname + win.location.search));
      this.flow = {
        title: `${this.cfg.environment} ${this.cfg.mode} recording ${this.session.startedAt}`,
        selectorAttribute: this.cfg.attribute,
        steps: [
          { type: 'customStep', name: XREC_SESSION_STEP, parameters: this.session },
          {
            type: 'setViewport',
            width: win.innerWidth,
            height: win.innerHeight,
            deviceScaleFactor: win.devicePixelRatio || 1,
            isMobile: false,
            hasTouch: (win.navigator.maxTouchPoints ?? 0) > 0,
            isLandscape: win.innerWidth >= win.innerHeight,
          },
          { type: 'navigate', target: 'main', url: startUrl, assertedEvents: [{ type: 'navigation', url: startUrl }] },
        ],
      };
      this.lastAction = null;
    }
    this.headerSteps = 3;
    this._count.set(this.flow.steps.length - this.headerSteps);
    this.attachListeners();
    this._active.set(true);
    this.persistNow();
  }

  private reset(): void {
    this.detachListeners();
    this.pendingFills.clear();
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    this.flow = null;
    this.session = null;
    this.lastAction = null;
    this._active.set(false);
    this._count.set(0);
    this._skipped.set(0);
    this._picking.set(false);
    this._truncated.set(false);
    this.storage()?.removeItem(STORAGE_KEY);
  }

  private attachListeners(): void {
    const doc = this.doc;
    const win = doc.defaultView!;
    this.zone.runOutsideAngular(() => {
      this.listen(doc, 'click', this.onClick, { capture: true });
      this.listen(doc, 'input', this.onInput, { capture: true, passive: true });
      this.listen(doc, 'change', this.onChange, { capture: true, passive: true });
      this.listen(doc, 'keydown', this.onKeydown, { capture: true });
      this.listen(win, 'pagehide', this.onPageHide, {});
    });
    const sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.onNavigation(e.urlAfterRedirects));
    this.detach.push(() => sub.unsubscribe());
  }

  private listen<E extends Event>(target: EventTarget, type: string, fn: (e: E) => void, opts: AddEventListenerOptions): void {
    const handler = fn as unknown as EventListener;
    target.addEventListener(type, handler, opts);
    this.detach.push(() => target.removeEventListener(type, handler, opts));
  }

  private detachListeners(): void {
    this.detach.forEach((d) => d());
    this.detach = [];
  }

  // ---- DOM handlers (outside the Angular zone) ----------------------------

  private readonly onClick = (e: MouseEvent): void => {
    const origin = originOf(e);
    if (!origin || isRecorderUi(origin)) return;
    const hit = this.resolve(origin);

    if (this._picking()) {
      // Assertion pick: swallow the click so the app doesn't act on it.
      e.preventDefault();
      e.stopImmediatePropagation();
      this._picking.set(false);
      if (!hit) return this.skip(origin);
      this.flushFills();
      const x = this.xrec(hit);
      const text = this.policy.assertionText(hit.host);
      if (text) x.expectText = text;
      this.push({ type: 'waitForElement', target: 'main', selectors: this.selectors(x), visible: true, [XREC]: x });
      return;
    }

    if (isNativeChoiceControl(origin)) return; // captured by 'change'
    if (!hit) return this.skip(origin);
    this.flushFills();
    const rect = hit.host.getBoundingClientRect();
    const x = this.xrec(hit);
    this.pushAction({
      type: 'click',
      target: 'main',
      selectors: this.selectors(x),
      offsetX: offset(e.clientX - rect.left, rect.width),
      offsetY: offset(e.clientY - rect.top, rect.height),
      [XREC]: x,
    });
  };

  private readonly onInput = (e: Event): void => {
    const origin = originOf(e);
    if (!origin || !isTextEntry(origin) || isRecorderUi(origin)) return;
    const hit = this.resolve(origin);
    if (!hit) return this.skip(origin);
    // Debounce: keystrokes only update the pending entry; it becomes one 'change' on the next action.
    this.pendingFills.delete(hit.id);
    this.pendingFills.set(hit.id, { hit, field: origin });
  };

  private readonly onChange = (e: Event): void => {
    const origin = originOf(e);
    if (!origin || isRecorderUi(origin)) return;
    if (isTextEntry(origin)) return this.flushFills();
    const hit = this.resolve(origin);
    if (!hit) return this.skip(origin);

    if (origin instanceof HTMLInputElement && (origin.type === 'checkbox' || origin.type === 'radio')) {
      this.flushFills();
      const x = this.xrec(hit, origin);
      x.checked = origin.checked;
      const carried = this.absorbFocusClick(hit.id);
      if (carried) x.network = carried;
      // Selectors point at the tagged wrapper, which DevTools can click even when the native input is hidden.
      const rect = hit.host.getBoundingClientRect();
      this.pushAction({
        type: 'click',
        target: 'main',
        selectors: this.selectors({ ...x, inner: undefined }),
        offsetX: offset(rect.width / 2, rect.width),
        offsetY: offset(rect.height / 2, rect.height),
        [XREC]: x,
      });
    } else if (origin instanceof HTMLSelectElement) {
      this.flushFills();
      this.recordChange(hit, origin, 'select');
    }
  };

  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (e.altKey && e.shiftKey && e.code === 'KeyA') {
      e.preventDefault();
      this.togglePicking();
      return;
    }
    if (e.key === 'Escape' && this._picking()) {
      this._picking.set(false);
      return;
    }
    if ((e.key !== 'Enter' && e.key !== 'Escape') || e.isComposing) return;
    const origin = originOf(e);
    if (!origin || isRecorderUi(origin)) return;
    // Enter on buttons/links already produces a click; in a textarea it's a newline.
    if (e.key === 'Enter' && (!isTextEntry(origin) || origin instanceof HTMLTextAreaElement)) return;
    const hit = this.resolve(origin);
    if (!hit) return;
    this.flushFills();
    this.pushAction({ type: 'keyDown', target: 'main', key: e.key, [XREC]: this.xrec(hit, origin) });
    this.push({ type: 'keyUp', target: 'main', key: e.key });
  };

  private readonly onPageHide = (): void => {
    this.flushFills();
    this.persistNow();
  };

  private onNavigation(url: string): void {
    if (!this.flow) return;
    this.flushFills();
    const target = this.absolute(this.policy.navigationUrl(url));
    const steps = this.flow.steps;
    const last = this.lastAction;
    const tail = steps.at(-1);
    const lastIsTail = last !== null && (tail === last || (tail?.type === 'keyUp' && steps.at(-2) === last));
    const elapsed = Date.now() - this.startedAtMs - (last?.[XREC]?.t ?? 0);

    if (last && lastIsTail && !last.assertedEvents && elapsed <= NAV_CAUSAL_MS) {
      last.assertedEvents = [{ type: 'navigation', url: target }];
      this.schedulePersist();
      return;
    }
    const start = steps[2];
    if (steps.length === this.headerSteps && start?.type === 'navigate' && start.url === target) return;
    this.push({ type: 'navigate', target: 'main', url: target, assertedEvents: [{ type: 'navigation', url: target }] });
  }

  // ---- recording ------------------------------------------------------------

  /** Nearest ancestor carrying the data attribute, crossing open shadow roots. */
  private resolve(origin: Element): Hit | null {
    let node: Element | null = origin;
    while (node) {
      const host = node.closest(this.selector);
      if (host) return { host, id: host.getAttribute(this.cfg.attribute)! };
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    return null;
  }

  private xrec(hit: Hit, control?: Element): XRecStep {
    const x: XRecStep = {
      t: Date.now() - this.startedAtMs,
      route: this.policy.routeKey(this.router.url),
      testId: hit.id,
    };
    const inner = control ? innerSelector(hit.host, control) : undefined;
    if (inner) x.inner = inner;
    return x;
  }

  /** Data-attribute selectors only. No aria/text selectors: those can carry customer data. */
  private selectors(x: Pick<XRecStep, 'testId' | 'inner'>): Selector[] {
    const base = `[${this.cfg.attribute}=${cssString(x.testId)}]`;
    return [[x.inner ? `${base} ${x.inner}` : base]];
  }

  private recordChange(hit: Hit, field: Element, control?: 'select'): void {
    const capture = this.policy.fieldCapture(field, hit.id);
    const x = this.xrec(hit, field);
    if (control) x.control = control;
    if (capture.kind === 'masked') {
      x.masked = { length: capture.length };
      if (!this.session!.maskedTestIds.includes(hit.id)) this.session!.maskedTestIds.push(hit.id);
    }
    const carried = this.absorbFocusClick(hit.id);
    if (carried) x.network = carried;
    this.pushAction({
      type: 'change',
      target: 'main',
      selectors: this.selectors(x),
      value: capture.kind === 'value' ? capture.value : '',
      [XREC]: x,
    });
  }

  /**
   * Drops clicks on the same element immediately before a change or check: they only
   * focused or toggled the control, and replaying them would double-toggle checkboxes.
   * Absorbs every such click, since users often click a field more than once before typing.
   * Returns any requests those clicks had triggered so they aren't lost.
   */
  private absorbFocusClick(testId: string): XRecStep['network'] | undefined {
    const steps = this.flow!.steps;
    let network: XRecStep['network'];
    for (let tail = steps.at(-1); isFocusClick(tail, testId, this.lastAction); tail = steps.at(-1)) {
      steps.pop();
      this.lastAction = [...steps].reverse().find(isAction) ?? null;
      for (const m of [...(tail[XREC]?.network ?? [])].reverse()) {
        if (!network?.some((n) => n.method === m.method && n.urlPattern === m.urlPattern)) (network ??= []).unshift(m);
      }
    }
    this._count.set(steps.length - this.headerSteps);
    return network;
  }

  private pushAction(step: ActionStep): void {
    if (this.push(step)) this.lastAction = step;
  }

  private push(step: FlowStep): boolean {
    if (!this.flow) return false;
    if (this.flow.steps.length - this.headerSteps >= this.cfg.maxEvents) {
      this._truncated.set(true);
      return false;
    }
    this.flow.steps.push(step);
    this._count.set(this.flow.steps.length - this.headerSteps);
    this.schedulePersist();
    return true;
  }

  private flushFills(): void {
    if (this.pendingFills.size === 0) return;
    const pending = [...this.pendingFills.values()];
    this.pendingFills.clear();
    for (const { hit, field } of pending) this.recordChange(hit, field);
  }

  private skip(origin: Element): void {
    const el = interactiveAncestor(origin);
    if (!el || this.skippedEls.has(el)) return;
    this.skippedEls.add(el);
    this._skipped.update((n) => n + 1);
    if (this.session) this.session.skippedInteractions = this._skipped();
    if (this.cfg.mode === 'test') {
      console.warn(`[session-recorder] interactive element has no ${this.cfg.attribute}; not recorded`, el);
    }
  }

  private absolute(path: string): string {
    return this.doc.defaultView!.location.origin + path;
  }

  // ---- persistence (survives full reloads within the tab) -----------------

  private consumeUrlIntent(): 'on' | 'off' | null {
    const win = this.doc.defaultView;
    if (!win) return null;
    const url = new URL(win.location.href);
    const raw = url.searchParams.get(this.cfg.queryParam);
    if (raw === null) return null;
    // Remove the flag so it isn't bookmarked, shared or sent onward in links.
    url.searchParams.delete(this.cfg.queryParam);
    win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
    const v = raw.toLowerCase();
    return ON.has(v) ? 'on' : OFF.has(v) ? 'off' : null;
  }

  private readStored(): StoredState | null {
    try {
      const raw = this.storage()?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as StoredState;
      const session = s?.flow ? sessionOf(s.flow) : null;
      // A recording made under a different mode or attribute is discarded, never upgraded.
      const valid =
        session?.schemaVersion === 2 &&
        session.mode === this.cfg.mode &&
        session.attribute === this.cfg.attribute &&
        Array.isArray(s.flow.steps);
      return valid ? s : null;
    } catch {
      return null;
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.zone.runOutsideAngular(() => {
      this.persistTimer = setTimeout(this.persistNow, PERSIST_DELAY_MS);
    });
  }

  private readonly persistNow = (): void => {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (!this.flow) return;
    try {
      this.storage()?.setItem(STORAGE_KEY, JSON.stringify({ flow: this.flow, startedAtMs: this.startedAtMs }));
    } catch {
      // Quota exceeded: the in-memory recording is intact; only reload-survival is lost.
    }
  };

  private storage(): Storage | null {
    try {
      return this.doc.defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  }
}

function isAction(step: FlowStep): step is ActionStep {
  return step.type === 'click' || step.type === 'change' || step.type === 'keyDown';
}

/** A plain click on the element, not one the recorder wrote for a checkbox change (those carry `checked`). */
function isFocusClick(step: FlowStep | undefined, testId: string, lastAction: ActionStep | null): step is ActionStep {
  const x = step?.[XREC];
  return step?.type === 'click' && step === lastAction && !step.assertedEvents && x?.testId === testId && x.checked === undefined;
}

function sessionOf(flow: UserFlow): XRecSession | null {
  const first = flow.steps[0];
  return first?.type === 'customStep' && first.name === XREC_SESSION_STEP ? (first.parameters as XRecSession) : null;
}

/** DevTools click offsets are relative to the element; keyboard-triggered clicks report 0,0. */
function offset(value: number, size: number): number {
  return Math.round(Math.min(Math.max(value, 0), Math.max(size - 1, 0)));
}
