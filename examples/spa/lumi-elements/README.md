# Lumi custom-element SPA

This variant uses registered custom elements prefixed with `lu-`, including
`<lu-header>`, `<lu-navigation>`, and `<lu-project-list>`. All native templates
and their adjacent inline registration modules live in
[`index.html`](./index.html), and all demo-owned application code lives in
[`demo-app.js`](./demo-app.js).

The browser loads the page and its modules directly, without an application
build. It only requires the repository's Lumi library build:

```sh
pnpm run build
python -m http.server 8008
```
