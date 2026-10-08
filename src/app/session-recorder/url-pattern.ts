/** Pure URL helpers shared by the recorder (browser) and the generator (Node). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE = /^[A-Za-z0-9_-]{8,}$/;
const DIGIT = /\d/;
const NUMERIC = /^\d+$/;

/** True for path segments that look like record identifiers rather than route names. */
export function isIdLike(segment: string): boolean {
  return NUMERIC.test(segment) || UUID.test(segment) || (OPAQUE.test(segment) && DIGIT.test(segment));
}

/** Path only: drops origin, query string and fragment. */
export function stripQueryAndHash(url: string): string {
  return new URL(url, 'http://placeholder.invalid').pathname;
}

/** Path with id-like segments replaced, e.g. /deals/88213/tranches -> /deals/:id/tranches. */
export function toPathPattern(url: string, placeholder = ':id'): string {
  return stripQueryAndHash(url)
    .split('/')
    .map((s) => (s && isIdLike(s) ? placeholder : s))
    .join('/');
}
