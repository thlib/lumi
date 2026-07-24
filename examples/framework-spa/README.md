# Framework SPA comparisons

These three applications reproduce the result and interactions of
[`examples/spa`](../spa/) using each framework's own rendering model:

- [`react`](./react/) — React components and hooks
- [`vue`](./vue/) — Vue single-file components and Composition API
- [`angular`](./angular/) — Angular standalone components and signals

They share only [`data.ts`](./data.ts) and [`spa.css`](./spa.css).
None imports Lumi, `@thlib/lumi`, or anything from the repository's `src`
directory.

The applications are pnpm workspace packages. Install all workspace dependencies
from the repository root, then run an application by package name:

```sh
pnpm install
pnpm --filter luminate-spa-react run dev
```

Substitute `luminate-spa-vue` or `luminate-spa-angular` to run another
application. Use `pnpm --filter <package-name> run build` to create its
production bundle. The production bundles are committed so the repository-wide
static server can also open the applications at
`/examples/framework-spa/react/`, `/examples/framework-spa/vue/`, and
`/examples/framework-spa/angular/`. Rebuild the corresponding application after
changing its source.

## Performance comparison

From the repository root, run the production SPA stress benchmark:

```sh
pnpm run benchmark:spa
```

The runner rebuilds the React, Vue, and Angular applications, serves all four
implementations from one local server, and measures cache-disabled cold load,
route-render churn, repeated project filtering, long tasks, DOM stability, heap
change, and initial asset size in headless Chromium. It writes a readable report
to `benchmark/results/spa-performance.md` and full samples to the adjacent JSON
file.

Use `pnpm run benchmark:spa --help` for shorter smoke runs, custom cycle
counts, output paths, or `--skip-build`.
