# Session recorder

Record a flow in the browser, get Playwright and Cypress specs out the other end.
The same recorder runs in production for support, where it captures the path a user
took and never the values they typed.

Recordings are **Chrome DevTools Recorder user flows** (the `@puppeteer/replay` schema).
That buys three things for free: support can import a recording into the DevTools
Recorder panel and replay it, developers can record with Chrome's own Recorder and still
use our generator, and the community exporters for that format remain an option.

```
src/app/session-recorder/      Angular 20+ library (standalone, signals, zoneless-safe)
  recorder.model.ts            DevTools user-flow schema plus our x-rec extensions
  url-pattern.ts               Id stripping for URLs, shared with the generator
  recorder.tokens.ts           Config and its fail-closed defaults
  capture-policy.ts            The only code that reads values. Security review starts here.
  dom.ts                       Event-target helpers
  session-recorder.service.ts  Listeners, debouncing, persistence, toggle, entitlement
  session-recorder.interceptor.ts  Correlates HttpClient requests to actions
  recorder-badge.component.ts  Visible indicator with Add check / Stop and save / Discard
  *.spec.ts                    Jest specs for the policy and the service
tools/session-gen/             Node CLI: normalise once, emit per framework
  normalize.ts                 User flow (ours or Chrome's) -> framework-agnostic test plan
  emit-playwright.ts           Plan -> *.spec.ts
  emit-cypress.ts              Plan -> *.cy.ts
  emit-selectors.ts            Plan -> selectors.ts constants
  cli.ts                       Entry point; refuses to overwrite edited output
  fixtures/sample-recording.json    from our recorder
  fixtures/devtools-recording.json  from Chrome's Recorder panel
```

## Wiring

`app.config.ts`

```ts
import { inject } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideSessionRecorder, sessionRecorderInterceptor } from './session-recorder';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([sessionRecorderInterceptor, /* ...yours */])),
    provideSessionRecorder({
      mode: environment.recorderMode,          // only test builds set 'test'; unset = 'support'
      attribute: 'data-testid',                // whatever your tagging skill writes
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

`playwright.config.ts`: `use: { testIdAttribute: 'data-testid' }`.

`package.json`: `"session-gen": "tsx tools/session-gen/cli.ts"`.

Fix the import path from `tools/session-gen` to the library if you move it (`normalize.ts`, `cli.ts`).

## Using it

1. Append `?rec=on` to any URL. The flag is removed from the address bar immediately,
   the entitlement check runs, and the badge appears. `?rec=off` stops and clears.
2. Work through the flow. Press **Alt+Shift+A** (or Add check) then click an element to
   drop an assertion on it.
3. Stop and save downloads `recording-<mode>-<timestamp>.json`.
4. `npm run session-gen -- recordings/create-deal.json --name "Create deal"`
   writes `e2e/generated/create-deal/` and `cypress/e2e/generated/create-deal/`.
5. Fill in the `data` placeholders, run it, then copy it into your owned spec folder.
   The generated folder is disposable.

Try it on the samples: `npm run session-gen -- tools/session-gen/fixtures/sample-recording.json --name "Create deal"`,
and the same for `devtools-recording.json`.

## Format

A standard DevTools user flow, with our additions in two places:

```jsonc
{
  "title": "uat test recording 2026-10-02T14:03:11.204Z",
  "selectorAttribute": "data-testid",
  "steps": [
    // Session metadata. Custom steps survive DevTools edits and are no-ops on replay.
    { "type": "customStep", "name": "x-rec/session",
      "parameters": { "schemaVersion": 2, "mode": "test", "maskedTestIds": ["counterparty-tax-id"], ... } },
    { "type": "setViewport", ... },
    { "type": "navigate", "url": "https://.../deals", ... },
    // Per-step detail in "x-rec". DevTools ignores it.
    { "type": "change", "selectors": [["[data-testid=\"counterparty-tax-id\"]"]], "value": "",
      "x-rec": { "testId": "counterparty-tax-id", "masked": { "length": 9 }, "route": "/deals/new", "t": 9100 } },
    { "type": "click", "selectors": [["[data-testid=\"save-deal\"]"]], "offsetX": 30, "offsetY": 12,
      "assertedEvents": [{ "type": "navigation", "url": "https://.../deals/DL20931X" }],
      "x-rec": { "testId": "save-deal", "network": [{ "method": "POST", "urlPattern": "/api/deals", "status": 201 }], ... } },
    { "type": "waitForElement", "selectors": [["[data-testid=\"deal-status\"]"]], "visible": true,
      "x-rec": { "testId": "deal-status", "expectText": "Draft", ... } }
  ]
}
```

How our concepts map onto DevTools steps:

| Ours | DevTools step | Extra in `x-rec` |
| --- | --- | --- |
| fill | `change` (masked values written as `""`) | `masked`, `inner` |
| select | `change` on the `select` | `control: "select"` |
| check | `click` on the tagged wrapper | `checked`, `inner` |
| press Enter/Esc | `keyDown` + `keyUp` | `testId` |
| assertion | `waitForElement` with `visible: true` | `expectText` (test mode only) |
| caused navigation | `assertedEvents` on the action | — |
| response waits | — | `network` |

Selectors are data-attribute only. DevTools normally adds aria, text and XPath selectors;
we leave them out because aria and text selectors can contain customer data.

## Replaying a support recording in DevTools

1. Open the lower environment, then DevTools > Recorder > Import, and pick the JSON.
2. Change the origin in the `navigate` steps to the lower environment, and replace any
   `:id` path segments with ids from seeded data. Support recordings never contain real ids.
3. Masked fields replay as empty. Edit those `change` values to synthetic data.
4. Replay, or use slow replay to watch it step by step.

## Recording with Chrome's own Recorder

Start a recording in DevTools > Recorder and set **Selector attribute** to your data
attribute. The generator reads the data-attribute selector from each step and ignores
the rest. You get no masking metadata, no response waits and no text checks, so this is
for quick test authoring, not support.

## What the generator does

The recorder already writes a clean flow: keystrokes are collapsed into one `change`,
clicks that only focus a field are dropped, form submits aren't recorded (the click or
Enter that caused them is), and a route change within 4s of an action becomes that
action's `assertedEvents`. The generator applies the same focus-click rule to
Chrome-recorded flows, turns `assertedEvents` into URL assertions, and arms each action's
`network` entries as response waits before performing it. Ids in URLs become `[^/]+` in assertions and
`data.pathParamN` placeholders in `goto`s.

## Gotchas to revisit

**Selectors**
- Attribute values that embed record ids (`deal-row-DL20931`) are unique but not stable
  across environments. Agree a scheme with the tagging skill for repeated rows
  (`deal-row` plus position or a business key that exists in seeded data).
- ag-Grid: cell renderers, cell editors and header menus need the attribute applied inside
  the grid, and virtualised rows may not exist in the DOM at replay until scrolled.
  Grid keyboard editing is the weakest area; expect to hand-write those steps.
- CDK overlays (mat-select, menus, datepicker) render outside the component. Tag
  `mat-option` and menu items, or those clicks are skipped. mat-select records as two
  clicks, not a `select`.
- Wrapped controls: when the attribute sits on a wrapper, the recorder stores CSS for the
  native control inside it (`input`, `input[type="checkbox"]`, plus `[name]` if needed to
  disambiguate). If that still matches several elements, Playwright's strict mode fails
  the step, which is the right signal to tag the inner control.
- The badge's "untagged" count and test-mode console warnings are your coverage report
  for the tagging skill.

**What isn't captured**
- Requests outside HttpClient (raw `fetch`, WebSockets, SSE), drag and drop, hover-only
  menus, double and right clicks, file uploads, iframes, closed shadow roots.
- Flows that open a new tab. Session storage is per tab.

**Generated tests**
- Page-load GETs get merged into the triggering action's waits. Usually right, sometimes
  too much; prune when promoting. Add polling endpoints to `ignoreRequests`.
- Text assertions capture whatever was on screen, including timestamps and generated ids.
- Test-mode recordings contain real path ids and typed values from that environment. Replay
  elsewhere needs seeded data. Treat recordings as test data and keep real data out of the repo.
- Masked values emit empty placeholders, so the spec fails until filled. That's deliberate.
- Unit tests aren't generated. A recorded flow is an integration artifact; the plan
  format can feed a component-test emitter later if you want to try it.

**Format**
- Editing or re-exporting a recording in DevTools drops the `x-rec` fields (confirmed
  against `@puppeteer/replay`'s parser). Session metadata survives, including which fields
  were masked; response waits, text checks and inner-control selectors don't. Generate
  before editing in DevTools, or treat the DevTools copy as a support-only artifact.
- Route changes are written as `assertedEvents` on the action, as DevTools does. If a
  DevTools replay hangs waiting for an SPA navigation, delete that `assertedEvents` entry.
- `navigate` URLs are absolute, so they carry the origin of the environment recorded in.
- `hover`, `doubleClick` and `scroll` steps from Chrome-recorded flows are skipped with a note.

**Production**
- Never import a support recording into DevTools while pointed at production: replay
  performs real actions.
- `canRecord` runs in the browser: it's a UX gate, not a security boundary. The
  guarantee is that support mode never captures values, enforced in `capture-policy.ts`.
  Consider pairing the role check with a feature flag so recording can be killed per
  environment without a deploy.
- Add a CI check that the production environment file never sets `recorderMode: 'test'`.
- The 4s navigation heuristic and the id-detection rule in `url-pattern.ts` (digits,
  UUIDs, 8+ char tokens containing a digit) will misfire occasionally. Both are one-line
  changes.
- Alt+Shift+A may collide with an existing shortcut in the app.
