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

## The model

The model separates concerns that tend to become entangled in frontend code:

- Let HTML describe the document. Let small, replaceable tools connect data or
  behavior to it.
- HTML describes native semantic structure.
- CSS controls presentation and layout.
- Plain JavaScript functions project data into declared DOM state.
- The application owns data, business decisions, and update timing.
- Native events carry user intent back to the application, which may produce
  new data and explicitly update again.

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
open Shadow DOM. Managed event bindings delegate native events without
introducing a synthetic event system.

Mounting replaces the target's existing contents with a fresh clone of the
component template. Array repetition deliberately preserves identity by
position: Lumi does not inspect `key`, `id`, object identity, or any other
application value to infer keyed identity.

The supported package surface is the functions and types exported from
`@thlib/lumi`. Its public functions and lifecycle are documented in
[API.md](./API.md). Other package modules and lifecycle shapes are renderer
internals and may change independently.

Lumi is implemented in JavaScript and ships generated TypeScript declarations.
TypeScript applications can type a component's presentation snapshot at its
definition boundary:

```ts
import {
  bind,
  component,
  type ComponentOptions,
} from '@thlib/lumi'

type CounterData = {
  count: number
}

const options: ComponentOptions<CounterData> = {
  template: document.querySelector('#counter-template'),
  bindings: [
    bind('output', (data, output) => {
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

Try the [live counter example](https://thlib.github.io/lumi/examples/counter/)
or the [component-based SPA](https://thlib.github.io/lumi/examples/spa/).
Their source is in [`examples/counter`](./examples/counter) and
[`examples/spa`](./examples/spa).

Equivalent standalone implementations of the SPA in React, Vue, and Angular
are available in
[`examples/framework-spa`](./examples/framework-spa). They share the demo's
content and visual design, but do not import or depend on Lumi.

## SPA benchmark

The equivalent SPAs are exercised through the same verified route and project
filter workload in headless Chromium.

> [**View the latest SPA performance comparison →**](./benchmark/results/spa-performance.md)

The generated report is the source of truth for current results, environment
details, and methodology. The [benchmark source](./benchmark/spa-comparison.js)
and [raw samples](./benchmark/results/spa-performance.json) are also available.
Run it locally with `pnpm benchmark:spa`.

The SPA's `demo-components.js` module contains ordinary JavaScript
orchestration utilities owned by that demo, including its `define`, `resolve`,
`present`, and `connect` functions. They are not Lumi APIs; another SPA using
Lumi could organize its application with different utilities or a framework.

## Application binding conventions

Applications can package repeated projection conventions as ordinary functions
that return Lumi bindings. For example, an application may give `data-field`
attributes direct-property semantics:

```js
import {bind, component} from '@thlib/lumi'

function bindFields() {
  return bind(
    '[data-field]',
    (data, element) => data[element.dataset.field],
  )
}

const counter = component({
  template,
  bindings: [bindFields()],
})
```

`data-field` and `bindFields` belong to the application. Lumi sees only the
binding returned by its public `bind()` function. A missing or nullish
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
changes may be released in a minor version and are documented in
[CHANGELOG.md](./CHANGELOG.md).

The complete architecture, boundaries, event model, intentional exclusions,
acceptance criteria, and open questions are documented in
[DESIGN.md](./DESIGN.md).

## Contributing and security

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow. Report
security issues [privately](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

## License

Copyright 2026 Timo Huovinen. Licensed under the
[Apache License 2.0](./LICENSE).
