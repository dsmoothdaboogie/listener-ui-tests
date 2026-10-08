# Copying session-gen into your repo

Version: see `VERSION` in this folder. Turns recordings into Playwright and Cypress specs.

## Requirements

- Node 20.19+ (the Angular 20 minimum).
- The recorder folder at `src/app/session-recorder/`: this folder imports
  `recorder.model.ts` and `url-pattern.ts` from `../../src/app/session-recorder/`.
  Copy both folders to those paths and no import edits are needed.
- Dev dependency: `npm i -D tsx` (plus `vitest` to run the spec; it relies on Vitest
  providing `__dirname`, which it does for `.ts` files).

## Copy

Copy this whole folder to `tools/session-gen/`, then add to `package.json`:

```json
"scripts": { "session-gen": "tsx tools/session-gen/cli.ts" }
```

The folder imports only `node:*` built-ins, its own files and the two recorder files above.

## Use

```
npm run session-gen -- recordings/create-deal.json --name "Create deal" [--data recordings/create-deal.data.json]
```

Writes `e2e/generated/<slug>/` and `cypress/e2e/generated/<slug>/`. Options:

| Option | Default | |
| --- | --- | --- |
| `--name <text>` | file name | Test name; single recording only |
| `--data <file.json>` | none | Values for the `data` placeholders (masked fields, path ids); single recording only |
| `--targets <list>` | `playwright,cypress` | |
| `--playwright-out <dir>` | `e2e/generated` | |
| `--cypress-out <dir>` | `cypress/e2e/generated` | |
| `--force` | off | Overwrite generated files even if they were edited |

`--data` takes a JSON object of strings keyed by placeholder name, for example
`{ "counterpartyTaxId": "000000001" }`. Use synthetic values only. Unknown keys are an
error (the message lists the recording's placeholders), and so are empty strings;
missing keys stay empty with a
TODO, and the spec fails until they're filled.

Generated folders are disposable. Copy a spec into your own spec folder to keep it.

## Changelog

### 1.0.0 (2026-10-07)

- First versioned release.
- New `--data` option to fill placeholders from a JSON file.
