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

- each spa in examples/spa that has a build or bundle stage should have it's own build or bundle script in their own folder ( for example called build.js or bundle.js or whatever is appropriate), they should not share them. Equally lumi src should have own build that creates /dist/lumi.js and /dist/lumi.js.map and one lumi.d.ts file for the ts types compatibility, it should not create plan.d.ts etc...


This: // The document registry intentionally accepts components with different local
// presentations. Keep that dynamic boundary in this facade while each
// TypeScript module owns its behavior beside the corresponding template.
export const attr = lumiAttr as (
  selector: string,
  name: string,
  project: Projection,
) => Binding<any>
export const classToggle = lumiClassToggle as (
  selector: string,
  name: string,
  project: Projection,
) => Binding<any>
export const on = lumiOn as (
  selector: string,
  type: string,
  handler: EventHandler,
) => Binding<any>
export const prop = lumiProp as (
  selector: string,
  project: Projection,
  name: string,
) => Binding<any>
export const repeat = lumiRepeat as (
  selector: string,
  project: Projection,
  bindings?: readonly Binding<any>[],
) => Binding<any>
export const style = lumiStyle as (
  selector: string,
  name: string,
  project: Projection,
) => Binding<any>
export const text = lumiText as (
  selector: string,
  project: Projection,
) => Binding<any>

should be unneccessary because of the lumi.d.ts or lumi.js.map


add type safety to lumi-ts .ts files






shim <template> to support `src` to fetch a `.html` file into itself.

aren't things like `tone-cream` absolutely smelly? the class should instead describe the _meaning_ and the css should pick the color for the meaning, this allows better dark/light theme too.

also I do want opening tags to be multi-line when they are twice as long as the standard size at which they normally become multi-line.


- remove `style` from `lumi` and also remove `classToggle` from lumi, because they are just attributes, how the attribute figures out the toggling or setting is outside of lumi

- remove people id's from css
- remove widths from css
- remove classes that are colors
- remove `background-color`
- remove the unused styles
- fix the mini-bars




