# Lumi

[![CI](https://github.com/thlib/lumi/actions/workflows/ci.yml/badge.svg)](https://github.com/thlib/lumi/actions/workflows/ci.yml)

Lumi is a small browser-first rendering layer.

It solves one problem: **declarative DOM rendering**.

It uses the tools that the browser supplies. Each type of content stays in its native format: markup in HTML, logic in JavaScript, and data in plain objects.

It brings declarative updates to native HTML without relocating HTML into
JavaScript or imposing a state-management model.

Application code describes what the
[DOM](https://en.wikipedia.org/wiki/Document_Object_Model) should show.
Rendering finds, creates, moves, and updates the necessary nodes.

```text
Native HTML + plain JavaScript + a data snapshot
                    |
                update(data)
                    |
        minimal writes to the DOM
```

Call `update(data)` to render a snapshot, then call it again when the snapshot changes.

Lumi does not fetch data. That is a different problem.

## Example

The template is native HTML with default content:

```html
<template id="counter">
  <section>
    <output>count is <span>0</span></output>
    <button type="button">Increment</button>
    <ul>
      <li>Item</li>
    </ul>
  </section>
</template>

<div id="counter-slot"></div>
```

The bindings are plain JavaScript. Each binding connects a CSS selector to a
function of the data:

```js
import {component, on, prop, repeat, text} from '@thlibjs/lumi'

let data = {count: 0, items: []}

const counter = component({
  source: document.querySelector('#counter'),
  bindings: [
    text('output span', ({data}) => data.count),
    prop('button', 'disabled', ({data}) => data.count >= 5),
    repeat('li', ({data}) => data.items, [
      text(':scope', ({item}) => item),
    ]),
    on('button', 'click', () => {
      const count = data.count + 1
      data = {count, items: [...data.items, `Item ${count}`]}
      counter.update(data)
    }),
  ],
}).mount(document.querySelector('#counter-slot'))

counter.update(data)
```

Each update writes only the DOM state that changed. The elements stay the
same elements, so the browser keeps their focus, selection, and form state.

## Speed

The repository has the same application in Lumi, Vue, React, Lit, and
Angular. A benchmark exercises each one in headless Chromium: first render,
route updates, filter updates, and a filter of a keyed list of 20,000 rows.

> [**View the latest SPA performance comparison →**](./benchmark/results/spa-performance.md)

The report has the results, the environment, and the method. The
[benchmark source](./benchmark/spa-comparison.js) and the
[raw samples](./benchmark/results/spa-performance.json) are also available.
Run the benchmark with `pnpm benchmark:spa`.

## Install

Install Lumi from npm when the application uses a build step:

```sh
npm install @thlibjs/lumi
```

The package entry is unbundled ES module source. Bundlers can tree-shake and
minify it with the rest of the application. Stack traces through Lumi stay
readable.

Without a build step, load the browser bundle from a CDN:

```html
<script type="module">
  import {component, on, prop, text} from 'https://cdn.jsdelivr.net/npm/@thlibjs/lumi@0.2.0/dist/lumi.js'
</script>
```

`dist/lumi.js` is the production version: one minified ES module of
approximately 9 kB when compressed with gzip. One request replaces the module
graph. Its source map resolves to the published source, so developer tools
show the original code. Use a fixed version because an unpinned CDN URL
follows the latest release.

During development, load `dist/lumi.dev.js` from the same URL. The
development version has more checks, gives warnings, and explains each error
with a sentence. The production version gives a short error code. Refer to
[Development and production versions](API.md#development-and-production-versions).

Lumi has no fallback code for a browser that does not have an API that Lumi
uses. Safari needs a shim for `moveBefore()`. Refer to
[Browser requirements](API.md#browser-requirements).

## Documentation

- [API.md](./API.md): the functions, the update lifecycle, the types, the
  errors, and the browser requirements.
- [DESIGN.md](./DESIGN.md): the architecture, the ownership boundaries, the
  exclusions, and the open questions.
- [How array cardinality works](./docs/cardinality-explained.md): the
  mechanism of `repeat`.
- [Component sources in separate HTML files](./docs/html-sources.md): a
  source in its own `.html` file with no added Lumi code.
- [Renderer decisions](./docs/renderer-decisions.md): the reasons for the
  decisions in the renderer.

## Demos

- [Native bindings counter](https://thlib.github.io/lumi/examples/counter-native/)
  ([source](./examples/counter-native)): direct Lumi bindings with native HTML.
- [JSONPath counter](https://thlib.github.io/lumi/examples/counter/)
  ([source](./examples/counter)): an optional `data-path` convention with an
  RFC 9535 JSONPath adapter.
- [Native-module SPA](https://thlib.github.io/lumi/examples/spa/lumi-native/)
  ([source](./examples/spa/lumi-native)): inline templates and one unbundled
  demo module.
- [Component-build SPA](https://thlib.github.io/lumi/examples/spa/lumi-build/)
  ([source](./examples/spa/lumi-build)): bundled native component documents.
- [TypeScript component-build SPA](https://thlib.github.io/lumi/examples/spa/lumi-ts/)
  ([source](./examples/spa/lumi-ts)): native templates with colocated
  TypeScript behavior modules.
- [Data-attribute DSL SPA](https://thlib.github.io/lumi/examples/spa/lumi-dsl/)
  ([source](./examples/spa/lumi-dsl)): a data-attribute DSL with typed behavior
  modules.
- [Framework comparison SPAs](https://github.com/thlib/lumi/tree/main/examples/spa):
  equivalent React, Vue, Lit, and Angular applications. They share the SPA
  content and visual design without importing Lumi. Live examples:
  [React](https://thlib.github.io/lumi/examples/spa/react/),
  [Vue](https://thlib.github.io/lumi/examples/spa/vue/),
  [Lit](https://thlib.github.io/lumi/examples/spa/lit/), and
  [Angular](https://thlib.github.io/lumi/examples/spa/angular/).

To run the examples locally, start a web server from the repository root:

```sh
python -m http.server 8008
```

## Why Lumi exists

### The idea

* **Modern browsers provide far more than they used to.** Many capabilities that once required libraries, preprocessors, or framework abstractions are now built into HTML, CSS, JavaScript, and browser APIs.
* **Native browser behavior is highly optimized.** When applications work with the platform rather than recreate it, they benefit from browser-managed performance, accessibility, semantics, focus, events, validation, lifecycle, and interoperability.
* **LLMs work best with widely used, long-lived technologies.** HTML, CSS, JavaScript, and the DOM have decades of documentation, examples, bug reports, and production code. Agents can generally reason about these technologies more reliably than smaller proprietary languages and framework-specific abstractions. Keeping platform code explicit also makes application behavior easier to understand and modify without translating through additional conceptual layers.
* **Agentic coding makes verbosity cheaper.** Many abstractions were created because writing and maintaining the underlying code required too much time or specialist knowledge. An agent can now produce repetitive code, update affected references, perform migrations, and make coordinated changes across a codebase.
* **Reduced value of knowledge-substitution tooling.** These are tools whose main purpose is to let developers avoid learning or writing an underlying standard technology, rather than to provide strong correctness guarantees.
  * ORMs used mainly to avoid writing SQL
  * CSS preprocessors used mainly to compensate for limitations that modern CSS no longer has
  * Template DSLs used mainly to avoid HTML or DOM APIs
  * Framework wrappers around capabilities now provided directly by browsers
  * Configuration abstractions that hide otherwise ordinary platform configuration
  * Proprietary component syntax that replaces HTML, CSS, and JavaScript without adding meaningful guarantees
* **DOM synchronization is still difficult.** JavaScript can already handle state, modules, events, networking, and application logic. The error-prone part is keeping an existing DOM tree synchronized with changing data while preserving node identity, focus, selection, event state, and browser-owned behavior.

Something should solve that narrow problem. Its purpose is not to replace HTML, CSS, JavaScript, or the browser with another application model. It should provide the missing declarative connection between data and the DOM while leaving the underlying platform visible and directly usable.

### What broader approaches get wrong

When an application only needs declarative DOM updates, broader approaches
commonly add unnecessary machinery:

- Encoding HTML inside JavaScript strings, tagged values, or object structures
  hides document structure from native HTML tools and requires another
  mechanism to turn it back into DOM.
- Inventing a template language for expressions JavaScript already handles
  adds another syntax to learn, analyze, debug, and keep compatible.
- Inventing a file extension for code existing tools should already understand
  makes specialized editor and build support a condition of working with the
  source.
- Replacing JavaScript functions, modules, composition, and control flow with
  special syntax and conventions prevents ordinary language tools and
  techniques from being used directly.
- Requiring specialized compilers and parsers to produce browser-readable code
  makes a build pipeline necessary for a capability the browser already has.
- Coupling DOM rendering to renderer-owned state makes the application adopt
  a state model merely to synchronize the DOM.
- Maintaining a parallel model of browser properties and attributes to infer
  the intended DOM operation duplicates an evolving browser contract and can
  make the resulting operation ambiguous.
- Requiring a broader authoring and runtime model merely to update existing DOM
  declaratively increases conceptual cost and ties otherwise independent
  application concerns to the renderer.

These choices can be useful when the complete model is wanted. The mistake is
requiring that model merely to obtain efficient declarative rendering. Lumi
isolates that rendering capability while leaving the browser and application
in control of the surrounding responsibilities.

[Why not React, Vue, or Angular?](./DESIGN.md#why-not-react-vue-or-angular)
compares the update models.

## Status

The implementation is experimental. Its public API may change while the design
is validated. Lumi follows Semantic Versioning; before 1.0, breaking public API
changes may be released in a minor version.

## Contributing and security

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow. Report
security issues [privately](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

## License

Copyright 2026 Timo Huovinen. Licensed under the
[Apache License 2.0](./LICENSE).
