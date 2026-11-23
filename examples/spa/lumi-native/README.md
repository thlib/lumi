# Lumi native-module SPA

This is the browser-native version of the Lumi SPA. All native templates and
their adjacent inline module behavior live in [`index.html`](./index.html), and
the application starts in [`application.js`](./application.js).
The page imports that module and the built Lumi library directly, without an
application bundle.

It requires the repository's Lumi library build:

```sh
pnpm run build
python -m http.server 8008
```
