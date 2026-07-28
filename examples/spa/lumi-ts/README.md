# Lumi TypeScript component-build SPA

This is the TypeScript counterpart to [`lumi-build`](../lumi-build/). Each
native component or page template has a colocated TypeScript behavior module:

```text
components/
  navigation.html
  navigation.ts
```

The HTML files contain one native `<template>` and no executable code. Their
matching `.ts` files default-export the Lumi definition for that template. The
build derives each definition name from the shared filename, so neither file
performs a runtime `define()` call. Filenames must be unique across
[`components`](./components/) and [`pages`](./pages/).

The workspace at [`lumi-ts.code-workspace`](../../../lumi-ts.code-workspace)
opens this directory as its own VS Code root. Its root-scoped settings nest each
component's TypeScript and CSS files under its HTML template without affecting
other examples.

From the repository root, start the bundled development server:

```sh
pnpm run dev:spa:ts
```

Create the minified production output once with:

```sh
pnpm run build:spa:ts
```

The build type-checks the TypeScript module graph, bundles the behavior modules
into `dist/app.js`, and assembles the templates into `dist/index.html`. The
browser never loads source TypeScript or source component HTML.
