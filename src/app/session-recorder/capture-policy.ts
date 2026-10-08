import { Injectable, inject } from '@angular/core';
import { RECORDER_CONFIG } from './recorder.tokens';
import { stripQueryAndHash, toPathPattern } from './url-pattern';

/**
 * The only code that reads field values or decides what a recording may contain.
 * Security review scope: this file and url-pattern.ts. The service never touches
 * a value directly; it asks this class for a payload.
 */
export type FieldCapture = { kind: 'value'; value: string } | { kind: 'masked'; length: number };

@Injectable({ providedIn: 'root' })
export class CapturePolicy {
  private readonly cfg = inject(RECORDER_CONFIG);

  fieldCapture(field: Element, testId: string): FieldCapture {
    const value = readFieldValue(field);
    return this.mayCaptureValue(field, testId)
      ? { kind: 'value', value }
      : { kind: 'masked', length: value.length };
  }

  /** Text for a "contains text" check, or undefined for a visibility-only check. */
  assertionText(el: Element): string | undefined {
    if (this.cfg.mode === 'support' || isMarkedSensitive(el)) return undefined;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ASSERT_TEXT);
    return text || undefined;
  }

  /** Path kept for replaying navigation. Test mode keeps real path ids; support mode never does. */
  navigationUrl(url: string): string {
    return this.cfg.mode === 'support' ? toPathPattern(url) : stripQueryAndHash(url);
  }

  /** Route grouping key. Always id-free. */
  routeKey(url: string): string {
    return toPathPattern(url);
  }

  requestPattern(url: string): string {
    return toPathPattern(url, '*');
  }

  ignoresRequest(url: string): boolean {
    return this.cfg.ignoreRequests.some((p) => (typeof p === 'string' ? url.includes(p) : p.test(url)));
  }

  private mayCaptureValue(field: Element, testId: string): boolean {
    if (isAlwaysSensitive(field) || isMarkedSensitive(field)) return false;
    if (this.cfg.mode === 'support') return this.cfg.supportValueAllowList.includes(testId);
    return !this.cfg.alwaysMask.includes(testId);
  }
}

const MAX_ASSERT_TEXT = 200;
const SENSITIVE_AUTOCOMPLETE = /^(cc-|current-password$|new-password$|one-time-code$)/;

/** Never captured in any mode, whatever the config says. */
function isAlwaysSensitive(field: Element): boolean {
  if (!(field instanceof HTMLInputElement)) return false;
  if (field.type === 'password' || field.type === 'hidden') return true;
  const tokens = (field.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/);
  return tokens.some((t) => SENSITIVE_AUTOCOMPLETE.test(t));
}

/** Opt-out any template can apply to a field or a whole section: <div data-rec-mask>. */
function isMarkedSensitive(el: Element): boolean {
  return el.closest('[data-rec-mask]') !== null;
}

function readFieldValue(field: Element): string {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return field.value;
  }
  return (field as HTMLElement).isContentEditable ? (field.textContent ?? '') : '';
}
