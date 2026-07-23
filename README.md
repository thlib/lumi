# Lumi

Lumi is a small browser-first rendering layer.

It solves one problem: Declarative DOM rendering.

Application code describes what the [DOM](https://en.wikipedia.org/wiki/Document_Object_Model) should show, and Lumi finds, creates, moves, and updates the necessary DOM nodes.

```text
Native HTML + plain JavaScript + a data snapshot
                    |
                render(data)
                    |
        minimal writes to the DOM
```

Give Lumi data and it renders. Give it different data and it renders again.

It intentionally does not:

- Fetch data
- Watch for changes
- Decide when rendering should happen

## The model

Lumi separates concerns that tend to become entangled in frontend code:

- HTML describes native semantic structure.
- CSS controls presentation and layout.
- Plain JavaScript functions project data into declared DOM state.
- The application owns data, business decisions, and render timing.
- Native events carry user intent back to the application, which may produce
  new data and explicitly render again.

At the application boundary, one page has one render operation.
Nested components participate in that render rather than becoming
independently scheduled applications.

## Why not React, Vue, or Angular?

React, Vue, and Angular already provide declarative UI rendering, but rendering
is part of a broader framework-specific model. That model commonly includes a
template or component syntax, reactive state or change detection, scheduled
updates, component lifecycles, and framework tooling.

Lumi isolates the rendering capability.

The application does not adopt a framework's state, scheduling, template, or
lifecycle model to obtain efficient DOM updates. React, Vue, and Angular remain
the better fit when those broader models and ecosystems are wanted. Lumi
addresses the narrower case where the browser and application should retain
those responsibilities.

## Lumi's Principles

- Do not invent a language. Templates are HTML, styles are CSS, and rendering
  rules are ordinary JavaScript or TypeScript.
- Keep rendering explicit. Lumi has no signals, proxies, watchers, dependency
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

It currently supports template mounting and DOM adoption, scalar bindings,
nested components, and keyed repeated components. Application behavior uses
native events outside Lumi.

The public functions and lifecycle are documented in [API.md](./API.md).
Try the [live counter example](https://thlib.github.io/lumi/examples/counter.html)
or view its [HTML source](./examples/counter.html).

## Status

Lumi is in the experimental implementation phase. Its public API may change
while the design is validated.

The complete architecture, boundaries, event model, server-rendering model,
intentional exclusions, acceptance criteria, and open questions are documented
in [DESIGN.md](./DESIGN.md).
