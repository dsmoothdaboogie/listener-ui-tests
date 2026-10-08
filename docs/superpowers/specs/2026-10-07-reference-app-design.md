# Spec A: Reference app and copy-ready folders

Status: implemented (deviations from the reviewed draft are marked "Changed during implementation")
Date: 2026-10-07
Follow-ups: Spec B (troubleshooting capture, browser-only with pluggable sinks), Spec C (usage vs. coverage counts)

## Goal

Turn this repo into the reference copy of the session recorder: a small Angular app
where the two copyable folders are developed, tested end to end and versioned, so teams
can copy them into their own apps with confidence.

A "recording" is a JSON list of user actions (navigate, change, click, key press,
assertion). It never captures video, screenshots, DOM snapshots, mouse movement or
request/response bodies. Docs and anything sent to compliance should say so explicitly.

## Constraints

- **Distribution is by copying source.** No monorepo, no published packages.
  Teams copy `src/app/session-recorder/` and `tools/session-gen/` into the same paths
  in their own app.
- **Angular 20+** in all consuming apps. The reference app pins Angular 20.
- **Unit tests:** Vitest through the Angular CLI runner (`@angular/build:unit-test`),
  with `@testing-library/angular` and `@testing-library/user-event` for DOM tests.
- **E2E:** teams use both Cypress and Playwright. Both emitters are first-class.

## Non-goals (deferred)

Always-on buffer, "Report a problem", output sinks (ServiceNow/Jira), trace-ID capture,
`fetch`/XHR capture, route-template allowlist for the MNPI code-name gap, usage counts.
No new capture features beyond what this spec lists. The only generator feature added
is `--data` (see Generated specs).

## Repo layout

```
listener-ui/
  src/app/session-recorder/      Copy unit 1. Adds VERSION and COPYING.md.
  tools/session-gen/             Copy unit 2. Adds VERSION and COPYING.md.
  src/app/demo/                  Reference screens. Never copied.
    deals-list/
    deal-form/
    deal-detail/
  demo-api/server.mjs            Mock API behind the dev-server proxy (proxy.conf.json)
  src/environments/              environment.ts (test mode), environment.prod.ts (support mode)
  recordings/                    Committed recordings of the demo flows
  e2e/full-loop/                 Hand-written Playwright test that drives a recording
  e2e/generated/                 Playwright output of session-gen (regenerated in CI, gitignored)
  cypress/e2e/generated/         Cypress output of session-gen (regenerated in CI, gitignored)
  scripts/check-boundaries.mjs
  scripts/check-prod-mode.mjs
  scripts/generate-e2e.mjs       Regenerates all generated specs
  scripts/serve-demo.mjs         Starts the mock API and ng serve together
  .github/workflows/ci.yml
```

## Copy units

### `src/app/session-recorder/`

- May import only `@angular/*`, `rxjs` and files inside the folder.
- `VERSION`: semver, starts at `1.0.0`.
- `COPYING.md`: files to copy, `app.config.ts` wiring, root template badge,
  `playwright.config.ts` `testIdAttribute`, minimum Angular version (20), note that the
  Angular 20 Vitest runner is experimental, and a changelog. The wiring section moves
  here from the README; the README links to it.

### `tools/session-gen/`

- May import only `node:*`, files inside the folder, and from the recorder exactly
  `recorder.model.ts` and `url-pattern.ts`, via the relative path
  `../../src/app/session-recorder/`. That path is correct for every app that copies
  both folders to the documented locations, so no import edits are needed after copying.
- `VERSION` and `COPYING.md` as above. `COPYING.md` lists the `package.json` script
  (`"session-gen": "tsx tools/session-gen/cli.ts"`) and the `tsx` dev dependency.

## Demo app

Purpose: exercise the recorder's hard cases with deterministic data. It is not a product.

| Screen | Route | Contents |
| --- | --- | --- |
| Deals list | `/deals` | Table of seeded deals; rows tagged `deal-row-0`, `deal-row-1`, ... (position, not record id); "New deal" button |
| New deal form | `/deals/new` | Text inputs; one field inside `data-rec-mask`; one `type="password"` field; native `select`; checkbox; `mat-select`; `mat-datepicker`; one untagged button; Save |
| Deal detail | `/deals/:id` | Deal fields and a `deal-status` element showing "Draft" |

- Save sends `POST /api/deals`, receives `201` with a new id, and navigates to `/deals/:id`.
- `demo-api/server.mjs` answers `/api/*` from in-memory seed data, reached through the
  Angular dev-server proxy. **Changed during implementation:** the draft used an in-app
  HttpClient interceptor, but Playwright and Cypress only see requests that reach the
  network, so generated response waits never resolved. Server state lasts for the life of
  the process; generated assertions use id-free path patterns, so new ids don't matter.
- Environments: `environment.ts` sets `recorderMode: 'test'`; `environment.prod.ts`
  leaves it unset (support mode). `canRecord` returns `true` in the demo.

## Tests

### Unit (Vitest, `ng test`)

| Spec | Style | Covers |
| --- | --- | --- |
| `capture-policy.spec.ts` | plain Vitest (converted from Jest) | existing cases |
| `url-pattern.spec.ts` | plain Vitest (new) | digits, UUIDs, 8+ char tokens with a digit become `:id`/`*`; query and hash stripped; plain words kept |
| `session-recorder.service.spec.ts` | Testing Library + `userEvent` (rewritten) | see below |
| `recorder-badge.component.spec.ts` | Testing Library (new) | hidden when idle; step count; "Field values hidden" in support mode; untagged count; Add check / Stop and save / Discard call the service |
| `tools/session-gen/*.spec.ts` | plain Vitest + file snapshots (new) | `normalize` and the three emitters, from both fixture recordings |

Service spec cases, each through a rendered test component and real `userEvent` input:

1. Typing in a field produces one `change` step with the final value.
2. A field in `data-rec-mask` and a password field produce `masked: { length }` and value `""`.
3. A click that only focuses a field, followed by typing, leaves only the `change`.
4. A checkbox click records one `click` with `checked` set to the final state.
5. Enter in a text field records `keyDown` + `keyUp`; Enter on a button records only the click.
6. A route change within 4s of an action becomes that action's `assertedEvents`; a later one becomes a `navigate` step.
7. Support mode records no values for any field and no `expectText` on assertions.
8. Untagged interactive elements increment the skipped count and produce no step.
9. Add check (Alt+Shift+A) then click produces `waitForElement` and the app does not receive the click.

Generator and check-script specs run in Node through `vitest.config.mts` (`npm run test:node`);
recorder specs run through `ng test` in jsdom, zoneless via `src/test-providers.ts`.
`npm run typecheck` covers the generator, e2e tests and Cypress specs (`tsconfig.node.json`,
`cypress/tsconfig.json`), which the Angular build doesn't type-check.

### Full loop (Playwright, `e2e/full-loop/`)

1. Open `/deals/new?rec=on` against the dev build (test mode).
2. Fill the form, use each control type, press Alt+Shift+A and click `deal-status` after Save.
3. Click "Stop and save"; capture the download with Playwright's download API.
4. Write it to `tmp/full-loop/create-deal.json` (gitignored, and outside `test-results/`,
   which Playwright empties on every run); the CI job passes it to `session-gen`.

Fallback if downloads prove flaky: the demo app (never the copy unit) exposes the
capture on `window` in dev builds only, and the test reads it from there.

### Generated specs

`recordings/` holds demo-app recordings in both formats: `create-deal.json` (from our
recorder) and `open-deal.devtools.json` (Chrome DevTools Recorder format, with the extra
aria/xpath selectors and a `hover` step Chrome writes). The two fixtures in
`tools/session-gen/fixtures/` are from another app, so they only feed the generator's
snapshot specs; they can't replay against the demo.

CI runs `session-gen` on `recordings/*.json` plus the full-loop capture, then runs the
generated Cypress and Playwright specs against the served demo app.

Generated specs open with an empty `data` block (masked values, path ids) and fail until
it is filled. New generator option, in scope: `--data <file.json>` pre-fills that block
from a JSON object keyed by placeholder name. Unknown keys are an error; missing keys
stay empty. CI passes a committed `recordings/<name>.data.json` (synthetic values) for each
committed capture, and `e2e/full-loop/create-deal.data.json` for the full-loop capture.

### Checks

- `check-boundaries.mjs`: parses imports (`import`, `export … from`, dynamic `import()`,
  `require`) in every `.ts/.mts/.cts/.tsx/.js` file of both copy units and fails on anything
  outside the allowed lists above. **Changed during implementation:** spec files may also
  import `@testing-library/*` (recorder) and `vitest` (generator).
- `check-prod-mode.mjs`: fails if `environment.prod.ts` sets `recorderMode: 'test'`.
- Each check has a test that feeds it a violating fixture and asserts failure.

## CI (GitHub Actions)

| Job | Runs | Depends on |
| --- | --- | --- |
| `unit` | `ng test`, `test:node`, `typecheck` | — |
| `checks` | boundary and prod-mode scripts, production build | — |
| `full-loop` | build, serve, Playwright full-loop test, upload capture as artifact | — |
| `generated-cypress` | session-gen on committed + full-loop captures, Cypress run | `full-loop` |
| `generated-playwright` | same, Playwright run | `full-loop` |
| `angular-latest` | update Angular to latest in a scratch copy, `ng build` + `ng test`; allowed to fail | — |

## Done when

1. `ng test` passes with every spec above running in Vitest.
2. `npm run session-gen` works on freshly copied folders with no import edits.
3. The full-loop test passes and its capture produces Cypress and Playwright specs that pass.
4. Specs generated from both demo recordings (ours and Chrome's format) pass in both frameworks,
   and the generator's snapshot specs cover both fixture recordings.
5. Both check scripts fail on their violating fixtures and pass on the repo.
6. Following `COPYING.md`, the folders copy into a fresh `ng new` Angular 20 app and a
   capture works. Done once by hand at the end, not in CI.

## Risks

| Risk | Plan |
| --- | --- |
| `mat-select`/datepicker overlays capture as two clicks and generated specs fail | Did not happen: both frameworks replay the two clicks. Documented in `COPYING.md`. |
| Angular 20's experimental Vitest runner can't host Testing Library specs | Fall back to Vitest with `@analogjs/vitest-angular`; `COPYING.md` then lists its config file. |
| Playwright download capture is flaky in CI | Dev-only `window` hook in the demo app, as above. |
| Generated text assertions pick up dynamic text | Demo screens avoid timestamps and generated ids in asserted elements. |
