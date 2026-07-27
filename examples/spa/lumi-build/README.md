# Lumi component-build SPA

Reusable views live in [`components`](./components/), while full route views
live in [`pages`](./pages/). Each file is a native HTML document that starts
with one `<template>` and ends with the ordinary `<script type="module">` that
default-exports the template's Lumi behavior. The build derives the definition
name from its filename, so these documents do not make runtime `define()`
calls. A document may keep local `<style>` elements beside or inside its
template. Filenames must be unique across both directories.

The browser always runs the assembled bundle in [`dist`](./dist/); the source
view documents are not loaded through a runtime HTML loader.

From the repository root, start the bundled development server:

```sh
pnpm run dev:spa
```

This watches the component and page documents, JavaScript modules, shell, and
shared stylesheet, rebuilds the application, and serves it at
`http://127.0.0.1:8008/`.

Create the minified benchmark/production output once with:

```sh
pnpm run build:spa
```

[`shell.html`](./shell.html) owns the outer document. The build places every
component and page template into its body, extracts each document's final
inline module as an esbuild input, and emits one `dist/app.js` module graph.
The root [`index.html`](./index.html) redirects repository-wide static servers
to that same bundled output.
