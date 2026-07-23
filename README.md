# Lumi

Lumi is a small browser-first rendering layer.

Lumi has one responsibility: declarative DOM rendering. Application code
describes what the DOM should show, and Lumi finds, creates, moves, and updates
the necessary DOM nodes.

```text
native HTML + ordinary JavaScript or TypeScript rules + a data snapshot
                                  |
                              render(data)
                                  |
                     minimal writes to the real DOM
```

Give Lumi data and it renders. Give it different data and it renders again.
Lumi does not fetch the data, watch it for changes, or decide when another
render should happen.

## The model

Lumi separates concerns that tend to become entangled in frontend code:

- HTML describes native semantic structure.
- CSS controls presentation and layout.
- Plain JavaScript or TypeScript functions project data into declared DOM
  state.
- The application owns data, business decisions, and render timing.
- Lumi compares projected values and performs only the necessary writes to
  persistent real DOM nodes.
- Native events carry user intent back to the application, which may produce
  new data and explicitly render again.

At the application boundary, one page has one render operation. Nested
components participate in that render rather than becoming independently
scheduled applications.

## Principles

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

## Status

Lumi is currently a design. Its public API has not been decided. Examples in
the design document illustrate responsibilities and behavior rather than a
committed syntax.

The complete architecture, boundaries, event model, server-rendering model,
intentional exclusions, acceptance criteria, and open questions are documented
in [DESIGN.md](./DESIGN.md).
