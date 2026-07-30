# Contributing to Lumi

Please open an issue before making a substantial API or architecture change.
Small fixes can go directly to a pull request.

## Development

Lumi requires Node.js 22 or newer.

```sh
pnpm install --frozen-lockfile
pnpm run lint
pnpm test
pnpm run benchmark
pnpm run test:package
pnpm exec playwright install chromium firefox
pnpm run test:browser --project=chromium --project=firefox
```

`pnpm run benchmark` is a small, repeatable Node/jsdom performance baseline for
scalar updates, selector fan-out, positional lists, and routed-event topology.
Use it to compare local changes on the same machine; its timings are not
cross-machine targets.

Changes to behavior should include a focused contract test. Changes to the
public API should also update `README.md`, `API.md`, and the TypeScript
consumer contract.

By submitting a contribution, you agree that it is licensed under the
Apache License 2.0.
