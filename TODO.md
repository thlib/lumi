# TODO

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
    import {component, on, prop, text} from 'https://cdn.jsdelivr.net/npm/@thlib/lumi@0.1.0/dist/lumi.js'
  </script>
  ```

  `dist/lumi.js` is a single minified ES module of about 10 kB gzipped, so one
  request replaces the module graph. Its sourcemap resolves against the
  published source, so devtools still show original code. Pin a version: an
  unpinned CDN URL follows the latest release.
- add 3 languages english, mandarin chinese, hindi, use i18n where you have t(txt) and n(txt, count) and ideally some standard (I assume .po files are a bit dated now?) way to host translation strings. where the txt is not english, it's an english like contextual placeholder, for example instead of saying "letter" it adds context to what that letter actually means using a `prefix_` (I wonder why english can't remain the translation string with an additional argument that gives context?), or actually make it 4. en + zh-Hans + ar + ua (ukraine)

squash all unpushed commits in lumi to a single well named commit

component styles in component files

emailValidationMessage could be done better

demo-app in all examples

lumi example should be the native one?








