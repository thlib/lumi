# Lumi TypeScript component-build SPA

This is the TypeScript counterpart to [`lumi-build`](../lumi-build/). Each
native component or page template has a colocated TypeScript behavior module:

```text
src/components/
  navigation.html
  navigation.ts
```

The HTML files contain one native `<template>` and no executable code. Their
matching `.ts` files default-export the Lumi definition for that template. The
build derives each definition name from the shared filename, so neither file
performs a runtime `define()` call. Filenames must be unique across
[`src/components`](./src/components/) and [`src/pages`](./src/pages/).

To use the VS Code companion-file view, open the repository root:

```sh
code .
```

VS Code reads the repository
[workspace settings](../../../.vscode/settings.json) and recommends the
configured [companion-file extension](../../../.vscode/extensions.json).
Install the recommended extension when VS Code prompts you. When you open an
HTML template, VS Code opens its existing TypeScript and CSS companion files in
the right-hand editor group. The Explorer also nests these companion files
under the HTML template.

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
