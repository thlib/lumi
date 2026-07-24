# Framework SPA comparisons

These three applications reproduce the result and interactions of
[`examples/spa`](../spa/) using each framework's own rendering model:

- [`react`](./react/) — React components and hooks
- [`vue`](./vue/) — Vue single-file components and Composition API
- [`angular`](./angular/) — Angular standalone components and signals

They share only [`data.ts`](./data.ts) and [`spa.css`](./spa.css).
None imports Lumi, `@thlib/lumi`, or anything from the repository's `src`
directory.

Each application is an independent package:

```sh
cd examples/framework-spa/react # or vue / angular
npm install
npm run dev
```

Use `npm run build` in an application directory to create its production
bundle. The production bundles are committed so the repository-wide static
server can also open the applications at `/examples/framework-spa/react/`,
`/examples/framework-spa/vue/`, and `/examples/framework-spa/angular/`.
Rebuild the corresponding application after changing its source.
