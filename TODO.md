# TODO

- SPA example should use some build step to bundle and minify, this boosts lumi benchmarks
- Docs should pin the ergonomics of having script near the dom that it manipulates
- SPA example should not rely on a framework but should still separate common logic from page logic, like form handling is common but loaded only for pages with forms
- Clarify 
  - **`null`, `undefined`, or other primitives** throw a `TypeError`.
    Arrays must also be dense — a hole (`[1, , 3]`) throws
    ([:489](../src/cardinality.js#L489)).
- publish to npm
  - ## Install

  ```sh
  npm install @thlib/lumi
  ```

  The package entry is unbundled ES module source. Bundlers tree-shake and
  minify it alongside the rest of an application, and stack traces through Lumi
  stay readable.

  Without a build step, load the browser bundle from a CDN:

  ```html
  <script type="module">
    import {bind, component, on, prop} from 'https://cdn.jsdelivr.net/npm/@thlib/lumi@0.1.0/dist/lumi.js'
  </script>
  ```

  `dist/lumi.js` is a single minified ES module of about 10 kB gzipped, so one
  request replaces the module graph. Its sourcemap resolves against the
  published source, so devtools still show original code. Pin a version: an
  unpinned CDN URL follows the latest release.
- document no BEM, use id for singleton, use native when possible, use part names and component names in classes.
- shorten name based on context, more context = shorter name, so event in an event location can be `e`, normally 3 letter abbreviations work well.
I like to use the letter `e` for the `event` variable and `el` for `element` for example.
