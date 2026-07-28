# SPA comparisons

These eight applications reproduce the same result and interactions using each
renderer’s own application model:

- [`lumi-native`](./lumi-native/) — inline templates and one native demo module
- [`lumi-build`](./lumi-build/) — bundled native component documents
- [`lumi-ts`](./lumi-ts/) — bundled native templates with colocated TypeScript
  behavior modules
- [`lumi-dsl`](./lumi-dsl/) — a data-attribute DSL and typed behavior modules
- [`vue`](./vue/) — Vue single-file components and Composition API
- [`react`](./react/) — React components and hooks
- [`lit`](./lit/) — Lit templates and reactive properties
- [`angular`](./angular/) — Angular standalone components and signals

All eight use the static JSON payloads in this directory and the
shared visual design in [`spa.css`](./spa.css). The data-attribute DSL, React,
Vue, Lit, and Angular also share the typed helpers in [`data.ts`](./data.ts)
and [`data-20k.ts`](./data-20k.ts). None of the four framework implementations
imports Lumi, `@thlib/lumi`, or anything from the repository’s `src` directory.
The Lumi applications import the repository's built
[`dist/lumi.js`](../../dist/lumi.js) bundle.

Lumi build keeps every component's native template and inline module behavior
together in [`lumi-build/src/components`](./lumi-build/src/components/). Run its
bundled development server from the repository root:

```sh
pnpm run dev:spa
```

Lumi TypeScript keeps each native template beside a separate TypeScript module
in [`lumi-ts/src/components`](./lumi-ts/src/components/). Run it with:

```sh
pnpm run dev:spa:ts
```

Use `pnpm run dev:spa:dsl` for the data-attribute DSL. The development servers
rebuild the same `lumi-build/dist/`, `lumi-ts/dist/`, and `lumi-dsl/dist/`
applications used
by the browser contracts and production benchmark. The browser-native
`lumi-native` variant can be served directly from the repository root after
running `pnpm run build`.

The framework applications are pnpm workspace packages. Install all workspace
dependencies from the repository root, then run one by package name:

```sh
pnpm install
pnpm --filter luminate-spa-react run dev
```

Substitute `luminate-spa-vue`, `luminate-spa-lit`, or
`luminate-spa-angular` to run another
application. Use `pnpm --filter <package-name> run build` to create its
production bundle. The framework production bundles are committed so the
repository-wide static server can open the applications at
`/examples/spa/react/`, `/examples/spa/vue/`, `/examples/spa/lit/`, and
`/examples/spa/angular/`.
Rebuild the corresponding application after changing its source.

Each application includes the unvirtualized **Records** route. It renders the
same deterministic 20,000-row dataset, filters it by group, and toggles
alphabetical order from the Record column header.

## Performance comparison

From the repository root, run the production SPA stress benchmark:

```sh
pnpm run benchmark:spa
```

The runner rebuilds all seven benchmark applications and measures
cache-disabled cold load,
route-render churn, repeated project filtering, a separately sampled
20,000-row filter cycle, long tasks, DOM stability, heap change, and initial
asset size in headless Chromium. It writes a readable report to
`benchmark/results/spa-performance.md` and full samples to the adjacent JSON
file.

Use `pnpm run benchmark:spa --help` for shorter smoke runs, custom cycle counts,
20k sample controls, output paths, or `--skip-build`.
