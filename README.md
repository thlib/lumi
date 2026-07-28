# Lumi

[![CI](https://github.com/thlib/lumi/actions/workflows/ci.yml/badge.svg)](https://github.com/thlib/lumi/actions/workflows/ci.yml)

Lumi is a small browser-first rendering layer.

It solves one problem: Declarative DOM rendering.

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

Call `update(data)` to render a snapshot, then call it again when the snapshot
changes.

It intentionally does not:

- Fetch data
- Watch for changes
- Decide when rendering should happen

## The idea

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

## The model

The model separates concerns that tend to become entangled in frontend code:

- Let HTML describe the document. Let small, replaceable tools connect data or behavior to it.
- HTML describes native semantic structure.
- CSS controls presentation and layout.
- Plain JavaScript functions project data into declared DOM state.
- The application owns data, business decisions, and update timing.
- Native events carry user intent back to the application, which may produce new data and explicitly update again.

At the application boundary, one page has one update operation.
Nested components participate in that update rather than becoming
independently scheduled applications.

## What broader approaches get wrong

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
- Coupling DOM rendering to renderer-owned reactive state or change detection
  makes the application adopt a state model merely to synchronize the DOM.
- Hiding update timing behind automatic observation, dependency tracking, or
  scheduling makes rendering work indirect and harder to reason about, test,
  and measure.
- Coupling component boundaries to independently scheduled state and
  lifecycles turns one page update into coordination between separate runtime
  boundaries.
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

## Principles

- Do not impose a template language. Templates are HTML, styles are CSS, and
  rendering rules are ordinary JavaScript or TypeScript. Independent tools may
  add their own binding conventions without changing the core API.
- Ship standards-bases JavaScript that works directly in modern browsers and ordinary bundlers.
- Keep rendering explicit. There are no signals, proxies, watchers, dependency
  tracking, or automatic rerendering.
- Keep application data separate from presentation and DOM manipulation.
- Preserve real DOM nodes and the browser-managed state attached to them.
- Use native events, bubbling, forms, focus behavior, layout, Shadow DOM, and
  slots rather than imitating the browser.
- Use one component model regardless of complexity.
- Keep compatibility shims below the component API.

## Implementation

The experimental implementation is plain JavaScript with no runtime
dependencies.

It currently supports template mounting, scalar bindings, positional
repetition from array projections, nested components, and bindings through
open Shadow DOM. Managed event bindings route native events at the component
boundary, or follow matching elements when a binding declares
`{at: 'elements'}`, without introducing a synthetic event system.

Mounting replaces the target's existing contents with a fresh clone of the
component template. Array repetition deliberately preserves identity by
position: Lumi does not inspect `key`, `id`, object identity, or any other
application value to infer keyed identity.

Every render projection receives a context containing the whole presentation
snapshot and the current occurrence. `repeat` changes cardinality; other
bindings project one value into the current occurrence.
[How array cardinality works](./docs/cardinality-explained.md) walks through
that mechanism.

The supported package surface is the functions and types exported from
`@thlib/lumi`. Its public functions and lifecycle are documented in
[API.md](./API.md). Other package modules and lifecycle shapes are renderer
internals and may change independently.

Lumi is implemented in JavaScript and ships generated TypeScript declarations.
TypeScript applications can type a component's presentation snapshot at its
definition boundary:

```ts
import {
  component,
  text,
  type ComponentOptions,
} from '@thlib/lumi'

type CounterData = {
  count: number
}

const options: ComponentOptions<CounterData> = {
  template: document.querySelector('#counter'),
  bindings: [
    text('output', ({data}, output) => {
      // data is CounterData; output is HTMLOutputElement.
      return data.count
    }),
  ],
}

const counter = component(options).mount(
  document.querySelector('#counter-slot'),
)

counter.update({count: 1})
```

Bare HTML, SVG, and MathML tag selectors receive the corresponding native DOM
element type. Complex selectors receive `Element`, matching the safe fallback
used by the browser's selector APIs. The declaration build and a package-level
TypeScript consumer contract run as part of `pnpm run lint`.

## Demos

- [Native bindings counter](https://thlib.github.io/lumi/examples/counter-native/)
  ([source](./examples/counter-native)): the smallest direct Lumi example. HTML
  stays native; JavaScript bindings beside the template project data into it.
- [JSONPath counter](https://thlib.github.io/lumi/examples/counter/)
  ([source](./examples/counter)): the same behavior using application-owned
  `data-path` attributes and a cached RFC 9535 JSONPath adapter. It shows an
  optional declarative convention, not a Lumi requirement.
- [Native-module SPA](./examples/spa/lumi-native): templates and adjacent
  behavior in one `index.html`, backed by one unbundled demo module.
- [Component-build SPA](./examples/spa/lumi-build): one native HTML document
  per component, assembled and bundled for development and production.
- [TypeScript component-build SPA](./examples/spa/lumi-ts): native HTML
  templates paired with colocated TypeScript behavior modules, assembled and
  bundled for development and production.
- [Framework comparison SPAs](./examples/spa): equivalent React, Vue,
  and Angular applications sharing the SPA's content and visual design without
  importing Lumi.

## SPA benchmark

The equivalent SPAs are exercised through the same verified route and project
filter workload in headless Chromium. A separate benchmark row measures
filtering the unvirtualized 20,000-row Records page so its heavier DOM work does
not change the established workload's meaning.

> [**View the latest SPA performance comparison →**](./benchmark/results/spa-performance.md)

The generated report is the source of truth for current results, environment
details, and methodology. The [benchmark source](./benchmark/spa-comparison.js)
and [raw samples](./benchmark/results/spa-performance.json) are also available.
Run it locally with `pnpm benchmark:spa`.

The two Lumi variants make their authoring and runtime tradeoffs explicit.
Lumi native uses a browser-loaded module graph. Lumi build associates native
component documents by filename during bundling, without runtime `define()`
calls. Both are measured independently by the SPA benchmark.

## Application binding conventions

Applications can package repeated projection conventions as ordinary functions
that return Lumi bindings. For example, an application may give `data-field`
attributes direct-property semantics:

```js
import {component, text} from '@thlib/lumi'

function bindFields() {
  return text(
    '[data-field]',
    ({data}, el) => data[el.dataset.field],
  )
}

const counter = component({
  template,
  bindings: [bindFields()],
})
```

`data-field` and `bindFields` belong to the application. Lumi sees only the
binding returned by its public `text()` function. A missing or nullish
projected field is a no-op. A different application can inject another
metadata convention, use external binding maps, or write projections directly
without changing Lumi.

To run the examples locally, start a web server from the repository root:

```sh
python -m http.server 8008
```

Run the JSDOM unit suite and the portable browser contracts with:

```sh
pnpm test
pnpm exec playwright install chromium firefox
pnpm run test:browser --project=chromium --project=firefox
```

## Status

The implementation is experimental. Its public API may change while the design
is validated. Lumi follows Semantic Versioning; before 1.0, breaking public API
changes may be released in a minor version.

The complete architecture, boundaries, event model, intentional exclusions,
acceptance criteria, and open questions are documented in
[DESIGN.md](./DESIGN.md).

## Contributing and security

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow. Report
security issues [privately](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

## License

Copyright 2026 Timo Huovinen. Licensed under the
[Apache License 2.0](./LICENSE).
