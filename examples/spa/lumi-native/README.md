# Lumi native-module SPA

This is the browser-native version of the Lumi SPA. All native templates and
their adjacent inline module behavior live in [`index.html`](./index.html), and
all demo-owned application code lives in [`demo-app.js`](./demo-app.js).
The page imports that module and the built Lumi library directly, without an
application bundle.

It requires the repository's Lumi library build:

```sh
pnpm run build
python -m http.server 8008
```
