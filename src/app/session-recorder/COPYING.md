# Copying the session recorder into your app

Version: see `VERSION` in this folder. The reference copy lives in the listener-ui repo,
where it is tested end to end against a demo app. Don't edit your copy in place: send
changes to the reference repo and re-copy, so every team stays on a known version.

## Requirements

- Angular 20 or later, standalone APIs. Works with and without zone.js.
- `HttpClient` provided with `withInterceptors` (for response waits).
- No other runtime dependencies: the folder imports only `@angular/*` and `rxjs`.

## Copy

Copy this whole folder to `src/app/session-recorder/` in your app. Keep that path if you
also copy `tools/session-gen/`: the generator imports `recorder.model.ts` and
`url-pattern.ts` from it by relative path.

The `*.spec.ts` files are Vitest specs using Angular Testing Library. To run them you need:

```
npm i -D vitest jsdom @testing-library/angular @testing-library/user-event @testing-library/dom
```

and the Angular unit-test builder in `angular.json`:

```jsonc
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "buildTarget": "::development",
    "tsConfig": "tsconfig.spec.json",
    "runner": "vitest",
    "providersFile": "src/test-providers.ts" // zoneless apps: export default [provideZonelessChangeDetection()]
  }
}
```

The specs use Vitest globals (`describe`, `it`, `vi`), so `tsconfig.spec.json` needs
`"types": ["vitest/globals"]`.

On Angular 20 this builder is marked experimental; it is stable from Angular 21. If your
app still runs Karma, either move to the builder or leave the specs out of your copy.

## Wire it up

`app.config.ts`

```ts
import { inject } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideSessionRecorder, sessionRecorderInterceptor } from './session-recorder';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    // List the recorder's interceptor first so it sees every request.
    provideHttpClient(withInterceptors([sessionRecorderInterceptor, /* ...yours */])),
    provideSessionRecorder({
      mode: environment.recorderMode,          // only test builds set 'test'; unset = 'support'
      attribute: 'data-testid',                // whatever your tagging convention writes
      appVersion: environment.version,
      environment: environment.name,
      canRecord: () => inject(EntitlementService).hasRole$('UI_SESSION_RECORDER'),
      ignoreRequests: ['/telemetry', '/heartbeat', /\/notifications\/poll/],
      alwaysMask: [],                          // test-mode extras, e.g. 'counterparty-tax-id'
      supportValueAllowList: [],               // support mode; needs security sign-off
    }),
  ],
};
```

Root template: `<rec-recorder-badge />` (import `RecorderBadgeComponent`).

`playwright.config.ts`: `use: { testIdAttribute: 'data-testid' }` (same value as `attribute`).

Production: never set `recorderMode: 'test'` in the production environment file, and
never hard-code `mode: 'test'` in `app.config.ts`. The reference repo's
`scripts/check-prod-mode.mjs` catches the common case (a `recorderMode: 'test'` literal in
`environment.prod.ts`) and is worth copying into your CI, but it is a tripwire, not a proof:
a constant or a hard-coded `mode` gets past it. Code review is the real control.

## What a recording is

A JSON list of user actions in Chrome DevTools Recorder format: navigations, clicks,
field changes, Enter/Escape, and checks you add. It never contains video, screenshots,
DOM snapshots, mouse movement, scrolling, or request/response bodies. In support mode
(the default) it also contains no typed values, no record ids and no on-screen text.

## Known limits

- `mat-select` records as two clicks (open, then the tagged `mat-option`). Generated specs
  replay this correctly; tag every `mat-option`.
- Not captured: requests outside `HttpClient`, drag and drop, hover-only menus, double and
  right clicks, file uploads, iframes, closed shadow roots, flows that open a new tab.

See the reference repo's README for the format, the generator and the full gotchas list.

## Changelog

### 1.0.0 (2026-10-07)

- First versioned release.
- Several clicks on a field before typing are now all dropped as focus clicks (previously
  only the last one was), keeping any requests they triggered.
