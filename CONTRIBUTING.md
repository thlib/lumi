# Contributing to Lumi

Please open an issue before making a substantial API or architecture change.
Small fixes can go directly to a pull request.

## Development

Lumi requires Node.js 22 or newer.

```sh
npm ci
npm run lint
npm test
npm run test:package
npx playwright install chromium firefox
npm run test:browser -- --project=chromium --project=firefox
```

Changes to behavior should include a focused contract test. Changes to the
public API should also update `README.md`, `API.md`, the TypeScript consumer
contract, and `CHANGELOG.md`.

By submitting a contribution, you agree that it is licensed under the
Apache License 2.0.
