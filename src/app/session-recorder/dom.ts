/** Event-target helpers. No value reading here; that lives in capture-policy.ts. */

export const RECORDER_UI_ATTR = 'data-recorder-ui';

const INTERACTIVE =
  'a[href], button, input, select, textarea, [contenteditable="true"], [role="button"], [role="link"], [role="tab"], ' +
  '[role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [tabindex]';

const TEXT_INPUT_TYPES = new Set([
  'text', 'email', 'number', 'tel', 'url', 'search', 'password',
  'date', 'datetime-local', 'time', 'month', 'week',
]);

/** The real element, including inside open shadow roots. */
export function originOf(e: Event): Element | null {
  const first = e.composedPath()[0];
  if (first instanceof Element) return first;
  return e.target instanceof Element ? e.target : null;
}

export function isRecorderUi(el: Element): boolean {
  return el.closest(`[${RECORDER_UI_ATTR}]`) !== null;
}

export function interactiveAncestor(el: Element): Element | null {
  return el.closest(INTERACTIVE);
}

export function isTextEntry(el: Element): boolean {
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Native controls whose meaning is captured by 'change', so their clicks are noise. */
export function isNativeChoiceControl(el: Element): boolean {
  if (el instanceof HTMLInputElement) return el.type === 'checkbox' || el.type === 'radio' || el.type === 'file';
  if (el instanceof HTMLSelectElement || el instanceof HTMLOptionElement) return true;
  return el instanceof HTMLLabelElement && el.control !== null;
}

export const cssString = (s: string): string => `"${s.replace(/["\\]/g, '\\$&')}"`;

/**
 * CSS for the native control inside a tagged wrapper (mat-form-field, mat-checkbox).
 * Uses attributes only, never values. Undefined when the control is the tagged element.
 */
export function innerSelector(host: Element, control: Element): string | undefined {
  if (host === control) return undefined;
  const tag = control.tagName.toLowerCase();
  const type = control.getAttribute('type');
  let sel =
    tag === 'input' && type ? `input[type=${cssString(type)}]`
    : control instanceof HTMLElement && control.isContentEditable && !['input', 'textarea'].includes(tag) ? '[contenteditable="true"]'
    : tag;
  const name = control.getAttribute('name');
  if (name && host.querySelectorAll(sel).length > 1) sel += `[name=${cssString(name)}]`;
  return sel;
}
