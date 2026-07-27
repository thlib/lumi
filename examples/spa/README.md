# SPA comparisons

These five applications reproduce the same result and interactions using each
renderer’s own application model:

- [`lumi-native`](./lumi-native/) — inline templates and one native demo module
- [`lumi-build`](./lumi-build/) — bundled native component documents
- [`vue`](./vue/) — Vue single-file components and Composition API
- [`react`](./react/) — React components and hooks
- [`angular`](./angular/) — Angular standalone components and signals

All five use the static JSON payloads in this directory and the
shared visual design in [`spa.css`](./spa.css). React, Vue, and Angular also
share the typed helpers in [`data.ts`](./data.ts) and
[`data-20k.ts`](./data-20k.ts). None of those three imports Lumi,
`@thlib/lumi`, or anything from the repository’s `src` directory.
The Lumi applications import the repository's built
[`dist/lumi.js`](../../dist/lumi.js) bundle.

Lumi build keeps every component's native template and inline module behavior
together in [`lumi-build/components`](./lumi-build/components/). Run its
bundled development server from the repository root:

```sh
pnpm run dev:spa
```

The development server rebuilds the same `lumi-build/dist/` application used
by the browser contracts and production benchmark. The browser-native
`lumi-native` variant can be served directly from the repository root after
running `pnpm run build`.

The framework applications are pnpm workspace packages. Install all workspace
dependencies from the repository root, then run one by package name:

```sh
pnpm install
pnpm --filter luminate-spa-react run dev
```

Substitute `luminate-spa-vue` or `luminate-spa-angular` to run another
application. Use `pnpm --filter <package-name> run build` to create its
production bundle. The framework production bundles are committed so the
repository-wide static server can open the applications at
`/examples/spa/react/`, `/examples/spa/vue/`, and `/examples/spa/angular/`.
Rebuild the corresponding application after changing its source.

Each application includes the unvirtualized **Records** route. It renders the
same deterministic 20,000-row dataset, filters it by group, and toggles
alphabetical order from the Record column header.

## Performance comparison

From the repository root, run the production SPA stress benchmark:

```sh
pnpm run benchmark:spa
```

The runner rebuilds all five applications and measures cache-disabled cold load,
route-render churn, repeated project filtering, a separately sampled
20,000-row filter cycle, long tasks, DOM stability, heap change, and initial
asset size in headless Chromium. It writes a readable report to
`benchmark/results/spa-performance.md` and full samples to the adjacent JSON
file.

Use `pnpm run benchmark:spa --help` for shorter smoke runs, custom cycle counts,
20k sample controls, output paths, or `--skip-build`.
