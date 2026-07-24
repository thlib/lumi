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

## Why not React, Vue, or Angular?

React, Vue, and Angular already provide declarative UI rendering, but rendering
is part of a broader framework-specific model. That model commonly includes a
template or component syntax, reactive state or change detection, scheduled
updates, component lifecycles, and framework tooling.

This separation isolates the rendering capability.

The application does not adopt a framework's state, scheduling, template, or
lifecycle model to obtain efficient DOM updates. React, Vue, and Angular remain
the better fit when those broader models and ecosystems are wanted. The
narrower approach applies when the browser and application should retain those
responsibilities.

## Principles

- Do not impose a template language. Templates are HTML, styles are CSS, and
  rendering rules are ordinary JavaScript or TypeScript. Independent tools may
  add their own binding conventions without changing the core API.
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
TypeScript consumer contract run as part of `npm run lint`.

Try the [live counter example](https://thlib.github.io/lumi/examples/counter/)
or the [component-based SPA](https://thlib.github.io/lumi/examples/spa/).
Their source is in [`examples/counter`](./examples/counter) and
[`examples/spa`](./examples/spa).

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
npm test
npx playwright install chromium firefox
npm run test:browser -- --project=chromium --project=firefox
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
