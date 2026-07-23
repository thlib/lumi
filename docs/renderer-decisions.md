# Renderer decisions from framework research

This note records implementation choices made after reviewing the Vue, React,
and Angular renderers. Lumi borrows mechanisms that strengthen declarative DOM
rendering without adopting framework-owned state, scheduling, or authoring
models.

## Applied

### Explicit bindings are the update plan

Vue compiler patch flags and Angular binding slots avoid searching an entire
rendered tree for changes. Lumi's binding list already identifies every dynamic
location directly. Each selector is resolved once at connection time, and each
render revisits only those declared locations.

Sources:

- [Vue renderer](https://github.com/vuejs/core/blob/main/packages/runtime-core/src/renderer.ts)
- [Angular binding slots](https://github.com/angular/angular/blob/main/packages/core/src/render3/bindings.ts)

### Properties reconcile with the live DOM

The previous projection alone is insufficient for browser-controlled
properties. A user can edit an input while the application's authoritative
value remains unchanged. Vue special-cases `value` against the element's
current value, and React tracks the current native `value` or `checked` state.

Lumi applies the underlying rule to every property binding: compare with the
live property on every render. It also records the property's value after a
write so browser coercion does not create redundant writes.

Sources:

- [Vue DOM property patching](https://github.com/vuejs/core/blob/main/packages/runtime-dom/src/modules/props.ts)
- [React input value tracking](https://github.com/react/react/blob/main/packages/react-dom-bindings/src/client/inputValueTracking.js)

### Keyed reconciliation minimizes physical moves

React's child reconciler tracks the highest old index seen so far. It is
linear and simple, but some rotations move more nodes than necessary. Vue
detects whether retained keys actually moved and, only then, keeps their
longest increasing subsequence in place.

Lumi uses the latter strategy. Ordinary updates and appends stay linear and do
not calculate a subsequence. Reorders use an O(n log n) subsequence calculation
to minimize physical moves while preserving every keyed component root.

Sources:

- [Vue keyed children reconciliation](https://github.com/vuejs/core/blob/main/packages/runtime-core/src/renderer.ts)
- [React child placement](https://github.com/react/react/blob/main/packages/react-reconciler/src/ReactChildFiber.js)

### Native atomic moves are preferred

The DOM Standard defines `moveBefore()` as a move that does not first remove
the node and that preserves state associated with it. Lumi uses it through
capability detection and falls back to `insertBefore()` where unavailable.
The component API and result order are identical in either case.

Source:

- [DOM Standard `moveBefore()`](https://dom.spec.whatwg.org/#dom-parentnode-movebefore)

### Executable sinks stay explicit

Angular rejects event-property bindings and applies security contexts to HTML,
URL, and resource bindings. Vue labels its raw HTML path unsafe, and React
requires the explicit `dangerouslySetInnerHTML` shape.

Lumi's generic bindings reject native event handler names, `innerHTML`,
`outerHTML`, and `srcdoc`. Event handlers remain application-owned native
listeners. Raw HTML remains unimplemented until it has a separate Trusted
Types and sanitization contract. Lumi does not include a partial URL sanitizer
because the correct policy depends on the element and resource context.
Applications must validate untrusted URLs at their data boundary.

Sources:

- [Angular sanitization](https://github.com/angular/angular/blob/main/packages/core/src/sanitization/sanitization.ts)
- [Vue DOM property patching](https://github.com/vuejs/core/blob/main/packages/runtime-dom/src/modules/props.ts)
- [React DOM property handling](https://github.com/react/react/blob/main/packages/react-dom-bindings/src/client/ReactDOMComponent.js)

## Kept out

### Reactivity, scheduling, and tree descriptions

Dependency tracking, queued rendering, concurrent work, compiler-generated
virtual nodes, and whole-tree reconciliation solve framework responsibilities
that Lumi deliberately leaves with the application. They do not improve the
explicit data-to-known-DOM-location operation enough to justify their runtime
and authoring models.

### Synthetic or delegated event systems

React delegates a broad event set at a root. Angular can coalesce multiple
handlers for one element and event. Vue stores stable invokers and includes a
timestamp guard for listeners attached during bubbling.

Lumi has no event system. Applications retain direct native listeners or use
their own small delegation helpers. Persistent component elements let those
listeners survive renders without framework machinery.

Sources:

- [React DOM event system](https://github.com/react/react/blob/main/packages/react-dom-bindings/src/events/DOMPluginEventSystem.js)
- [Angular listener instructions](https://github.com/angular/angular/blob/main/packages/core/src/render3/instructions/listener.ts)
- [Vue DOM events](https://github.com/vuejs/core/blob/main/packages/runtime-dom/src/modules/events.ts)

### Automatic property-versus-attribute inference

Vue includes element-specific rules for choosing between DOM properties and
attributes. React and Angular also maintain extensive DOM schemas. Lumi keeps
`property()` and `attribute()` explicit. This avoids shipping a parallel
browser schema and makes ownership visible in ordinary JavaScript.
