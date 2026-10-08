/**
 * Stage 1: DevTools Recorder user flow -> framework-agnostic test plan.
 *
 * Accepts flows from our recorder (with x-rec extensions) and plain flows recorded in
 * Chrome's own Recorder panel, as long as they were recorded with a selector attribute.
 * Nothing Playwright- or Cypress-specific may appear in this file.
 */
import {
  XREC,
  XREC_SESSION_STEP,
  type NetworkMark,
  type XRecSession,
  type XRecStep,
} from '../../src/app/session-recorder/recorder.model';
import { stripQueryAndHash, toPathPattern } from '../../src/app/session-recorder/url-pattern';
import { camel } from './emit-utils';

export type Value = { literal: string } | { placeholder: string };
export type UrlPart = string | { placeholder: string };

export interface Wait {
  alias: string;
  method: string;
  /** Path pattern with * for id segments. */
  path: string;
}

interface ActionBase {
  target: string;
  /** CSS for the native control inside the tagged element. */
  inner?: string;
  /** Responses to wait for; emitters must arm these BEFORE performing the action. */
  waits: Wait[];
}

type ActionInput =
  | { kind: 'click' }
  | { kind: 'fill'; value: Value }
  | { kind: 'select'; value: Value }
  | { kind: 'check'; checked: boolean }
  | { kind: 'press'; key: string };

export type ActionStep = ActionInput & ActionBase;

export type Step =
  | ActionStep
  | { kind: 'goto'; parts: UrlPart[] }
  | { kind: 'expectPath'; path: string }
  | { kind: 'expectVisible'; target: string }
  | { kind: 'expectText'; target: string; text: string };

export interface Section {
  route: string;
  steps: Step[];
}

export interface Placeholder {
  key: string;
  hint: string;
}

export interface PlanMeta {
  /** 'devtools' for flows recorded in Chrome's Recorder panel rather than our recorder. */
  source: 'session-recorder' | 'devtools';
  mode: string;
  attribute: string;
  appVersion?: string;
  environment?: string;
  startedAt?: string;
  viewport?: { width: number; height: number };
}

export interface TestPlan {
  name: string;
  meta: PlanMeta;
  sections: Section[];
  targets: string[];
  waits: Wait[];
  placeholders: Placeholder[];
  notes: string[];
}

/** Loosely typed on purpose: foreign flows may contain any DevTools step type. */
type RawStep = { type: string; [key: string]: unknown };

const KEYS = new Set(['Enter', 'Escape']);
const IGNORED = new Set(['customStep', 'setViewport', 'keyUp', 'scroll', 'close', 'emulateNetworkConditions']);

export function normalize(input: unknown, name: string): TestPlan {
  const flow = input as { title?: unknown; selectorAttribute?: unknown; steps?: unknown };
  if (!flow || typeof flow !== 'object' || !Array.isArray(flow.steps)) {
    throw new Error('Not a DevTools Recorder user flow (no steps array).');
  }
  const steps = flow.steps as RawStep[];
  const session = steps.find(
    (s) => s.type === 'customStep' && s['name'] === XREC_SESSION_STEP,
  )?.['parameters'] as XRecSession | undefined;
  const viewport = steps.find((s) => s.type === 'setViewport') as { width?: number; height?: number } | undefined;
  const attribute =
    session?.attribute ?? (typeof flow.selectorAttribute === 'string' ? flow.selectorAttribute : 'data-testid');

  const b = new PlanBuilder(name, {
    source: session ? 'session-recorder' : 'devtools',
    mode: session?.mode ?? 'devtools',
    attribute,
    appVersion: session?.appVersion,
    environment: session?.environment,
    startedAt: session?.startedAt,
    viewport: viewport?.width && viewport.height ? { width: viewport.width, height: viewport.height } : undefined,
  });
  const masked = new Set(session?.maskedTestIds ?? []);
  const resolve = selectorResolver(attribute);
  if (!session) b.note('Recorded in Chrome DevTools, not the session recorder: no masking metadata or response waits.');

  let carry: NetworkMark[] = [];
  let lastField: { target: string; inner?: string } | null = null;

  steps.forEach((step, i) => {
    const x = step[XREC] as XRecStep | undefined;
    const marks = [...carry, ...(x?.network ?? [])];
    carry = [];

    switch (step.type) {
      case 'navigate': {
        const url = String(step['url'] ?? '');
        b.push(toPathPattern(url), b.goto(url, session?.mode === 'support'));
        return;
      }

      case 'click': {
        const t = resolve(step, x);
        if (!t) return b.note(`Step ${i}: click has no ${attribute} selector; skipped.`);
        // A click that only focused the field the next step fills (DevTools records these).
        const next = steps[i + 1];
        if (next?.type === 'change' && !step['assertedEvents'] && resolve(next, next[XREC] as XRecStep | undefined)?.target === t.target) {
          carry = marks;
          return;
        }
        const input: ActionInput = x?.checked !== undefined ? { kind: 'check', checked: x.checked } : { kind: 'click' };
        b.action(route(x, b), t, input, marks);
        break;
      }

      case 'change': {
        const t = resolve(step, x);
        if (!t) return b.note(`Step ${i}: change has no ${attribute} selector; skipped.`);
        const value =
          x?.masked || masked.has(t.target)
            ? b.placeholderValue(t.target, x?.masked ? `masked at capture (${x.masked.length} chars)` : 'masked at capture')
            : { literal: String(step['value'] ?? '') };
        const isSelect = x?.control === 'select' || /(^|\s)select$/.test(t.inner ?? '');
        b.action(route(x, b), t, isSelect ? { kind: 'select', value } : { kind: 'fill', value }, marks);
        lastField = t;
        break;
      }

      case 'keyDown': {
        const key = String(step['key']);
        if (!KEYS.has(key)) return; // Tab, modifiers and typing are covered by 'change'
        const t = resolve(step, x) ?? lastField;
        if (!t) return b.note(`Step ${i}: ${key} pressed with no known target; skipped.`);
        b.action(route(x, b), t, { kind: 'press', key }, marks);
        break;
      }

      case 'waitForElement': {
        const t = resolve(step, x);
        if (!t) return b.note(`Step ${i}: check has no ${attribute} selector; skipped.`);
        b.track(t.target);
        b.push(
          route(x, b),
          x?.expectText ? { kind: 'expectText', target: t.target, text: x.expectText } : { kind: 'expectVisible', target: t.target },
        );
        carry = marks;
        return;
      }

      default:
        if (!IGNORED.has(step.type)) b.note(`Step ${i}: "${step.type}" isn't supported by the generator; skipped.`);
        return;
    }

    // Shared tail for actions: a navigation the action caused becomes a URL assertion.
    const nav = (step['assertedEvents'] as { type: string; url?: string }[] | undefined)?.find(
      (e) => e.type === 'navigation' && e.url,
    );
    if (nav?.url) b.push(toPathPattern(nav.url), { kind: 'expectPath', path: toPathPattern(nav.url) });
  });

  if (session?.truncated) b.note('Recording hit maxEvents and was truncated; the flow is incomplete.');
  if (session?.skippedInteractions) {
    b.note(`${session.skippedInteractions} interaction(s) hit elements without ${attribute}; steps may be missing.`);
  }
  return b.build();
}

/** Section key: the recorded route, else the route of the last navigation. */
function route(x: XRecStep | undefined, b: PlanBuilder): string {
  return x?.route ?? b.currentRoute();
}

/** Pulls the data-attribute value (and any inner CSS) out of x-rec or the standard selectors. */
function selectorResolver(attribute: string) {
  const re = new RegExp(`^\\[${attribute.replace(/[-]/g, '\\-')}=(["']?)(.+?)\\1\\]\\s*(.*)$`);
  return (step: RawStep, x: XRecStep | undefined): { target: string; inner?: string } | null => {
    if (x?.testId) return { target: x.testId, inner: x.inner };
    const selectors = (step['selectors'] as (string | string[])[] | undefined) ?? [];
    for (const sel of selectors) {
      const chain = Array.isArray(sel) ? sel : [sel];
      if (chain.length !== 1) continue; // shadow/frame chains: not supported in fallback
      const m = chain[0].match(re);
      if (m) return { target: m[2].replace(/\\(["\\])/g, '$1'), inner: m[3] || undefined };
    }
    return null;
  };
}

class PlanBuilder {
  private readonly sections: Section[] = [];
  private readonly targets = new Set<string>();
  private readonly waitByKey = new Map<string, Wait>();
  private readonly aliases = new Set<string>();
  private readonly placeholders: Placeholder[] = [];
  private readonly placeholderKeys = new Set<string>();
  private readonly notes: string[] = [];
  private pathParams = 0;

  constructor(
    private readonly name: string,
    private readonly meta: PlanMeta,
  ) {}

  currentRoute(): string {
    return this.sections.at(-1)?.route ?? '/';
  }

  push(route: string, step: Step): void {
    const current = this.sections.at(-1);
    if (current?.route === route) current.steps.push(step);
    else this.sections.push({ route, steps: [step] });
  }

  action(route: string, t: { target: string; inner?: string }, input: ActionInput, marks: NetworkMark[]): void {
    this.track(t.target);
    const step: ActionStep = { ...input, target: t.target, waits: this.toWaits(marks) };
    if (t.inner) step.inner = t.inner;
    this.push(route, step);
  }

  track(target: string): void {
    this.targets.add(target);
  }

  note(text: string): void {
    this.notes.push(text);
  }

  placeholderValue(target: string, hint: string): Value {
    return { placeholder: this.placeholder(camel(target), hint) };
  }

  /** Support recordings hold id-free paths, so ids become placeholders; test recordings replay as-is. */
  goto(url: string, idsMasked: boolean): Step {
    const path = stripQueryAndHash(url);
    const parts: UrlPart[] = path
      .split('/')
      .map((seg) =>
        idsMasked && seg === ':id'
          ? { placeholder: this.placeholder(`pathParam${++this.pathParams}`, `id segment in ${path}`) }
          : seg,
      );
    return { kind: 'goto', parts };
  }

  build(): TestPlan {
    return {
      name: this.name,
      meta: this.meta,
      sections: this.sections,
      targets: [...this.targets],
      waits: [...this.waitByKey.values()],
      placeholders: this.placeholders,
      notes: this.notes,
    };
  }

  private placeholder(base: string, hint: string): string {
    let key = base;
    for (let n = 2; this.placeholderKeys.has(key); n++) key = `${base}${n}`;
    this.placeholderKeys.add(key);
    this.placeholders.push({ key, hint });
    return key;
  }

  private toWaits(marks: NetworkMark[]): Wait[] {
    const out: Wait[] = [];
    for (const m of marks) {
      const key = `${m.method} ${m.urlPattern}`;
      let w = this.waitByKey.get(key);
      if (!w) {
        w = { alias: this.alias(m.method, m.urlPattern), method: m.method, path: m.urlPattern };
        this.waitByKey.set(key, w);
      }
      if (!out.includes(w)) out.push(w);
    }
    return out;
  }

  private alias(method: string, path: string): string {
    const tail = path
      .split('/')
      .filter((s) => s && s !== '*')
      .slice(-2)
      .join('-');
    const base = camel(`${method.toLowerCase()}-${tail}`);
    let alias = base;
    for (let n = 2; this.aliases.has(alias); n++) alias = `${base}${n}`;
    this.aliases.add(alias);
    return alias;
  }
}
