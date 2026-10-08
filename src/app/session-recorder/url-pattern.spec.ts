import { isIdLike, stripQueryAndHash, toPathPattern } from './url-pattern';

describe('url-pattern', () => {
  it.each(['88213', '0', '3f2a9c4e-1b7d-4e6a-9c1f-2b8d7e6a5c4f', 'DL-20931X', 'a1b2c3d4'])('treats %s as an id', (s) => {
    expect(isIdLike(s)).toBe(true);
  });

  it.each(['deals', 'new', 'tranches', 'counterparties', 'DL20931', 'abcdefgh'])('keeps %s as a route name', (s) => {
    expect(isIdLike(s)).toBe(false);
  });

  it('drops origin, query and fragment', () => {
    expect(stripQueryAndHash('https://app.example/deals/1?acct=4417#top')).toBe('/deals/1');
  });

  it('replaces id segments with :id by default', () => {
    expect(toPathPattern('/deals/88213/tranches/3f2a9c4e-1b7d-4e6a-9c1f-2b8d7e6a5c4f?x=1')).toBe(
      '/deals/:id/tranches/:id',
    );
  });

  it('accepts another placeholder for request patterns', () => {
    expect(toPathPattern('/api/deals/88213', '*')).toBe('/api/deals/*');
  });

  it('keeps the root path', () => {
    expect(toPathPattern('/')).toBe('/');
  });
});
