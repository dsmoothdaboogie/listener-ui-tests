/**
 * Recording format: a Chrome DevTools Recorder user flow (the @puppeteer/replay
 * schema), so recordings import into the DevTools Recorder panel and replay as-is.
 *
 * Our additions ride along in two places:
 *  - a leading `customStep` named `x-rec/session` (session metadata). Custom steps
 *    survive a round trip through DevTools and are no-ops on replay.
 *  - an `x-rec` field on individual steps (per-step detail). The official parser and
 *    the DevTools editor drop unknown fields, so this is lost if the flow is edited
 *    in DevTools; the generator then falls back to the standard fields.
 *
 * Framework-free on purpose: the Angular recorder writes it, the Node generator reads it.
 */
export type RecorderMode = 'test' | 'support';

export const XREC = 'x-rec';
export const XREC_SESSION_STEP = 'x-rec/session';

export interface XRecSession {
  schemaVersion: 2;
  mode: RecorderMode;
  attribute: string;
  appVersion: string;
  environment: string;
  startedAt: string;
  /** Test ids whose values were masked. Lives here so it survives DevTools edits. */
  maskedTestIds: string[];
  /** Interactive elements used during recording that had no data attribute. */
  skippedInteractions?: number;
  /** maxEvents was reached; later steps were dropped. */
  truncated?: boolean;
}

/** A request that started after a step, by method and id-free path only. */
export interface NetworkMark {
  method: string;
  urlPattern: string;
  status: number;
}

export interface XRecStep {
  /** Milliseconds since the session started. */
  t: number;
  /** Route pattern at capture time, ids replaced with :id. */
  route: string;
  testId: string;
  /** CSS for the native control inside the tagged element, when they differ. */
  inner?: string;
  control?: 'select';
  masked?: { length: number };
  /** Click on a checkbox/radio: the state it ended in (replay with check()/uncheck()). */
  checked?: boolean;
  expectText?: string;
  network?: NetworkMark[];
}

// ---- DevTools Recorder schema (the subset we write) -------------------------

export type Selector = string | string[];

export interface NavigationEvent {
  type: 'navigation';
  url?: string;
  title?: string;
}

interface BaseStep {
  target?: string;
  timeout?: number;
  assertedEvents?: NavigationEvent[];
  [XREC]?: XRecStep;
}

export type FlowStep =
  | (BaseStep & { type: 'customStep'; name: string; parameters: unknown })
  | (BaseStep & {
      type: 'setViewport';
      width: number;
      height: number;
      deviceScaleFactor: number;
      isMobile: boolean;
      hasTouch: boolean;
      isLandscape: boolean;
    })
  | (BaseStep & { type: 'navigate'; url: string })
  | (BaseStep & { type: 'click'; selectors: Selector[]; offsetX: number; offsetY: number })
  | (BaseStep & { type: 'change'; selectors: Selector[]; value: string })
  | (BaseStep & { type: 'keyDown'; key: string })
  | (BaseStep & { type: 'keyUp'; key: string })
  | (BaseStep & { type: 'waitForElement'; selectors: Selector[]; visible?: boolean });

export interface UserFlow {
  title: string;
  selectorAttribute?: string;
  timeout?: number;
  steps: FlowStep[];
}
