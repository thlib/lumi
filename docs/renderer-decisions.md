# Renderer decisions from framework research

This note records implementation choices made after reviewing the Vue, React,
and Angular renderers. The selected mechanisms strengthen declarative DOM
rendering without adopting framework-owned state, scheduling, or authoring
models.

## Applied

### Updates prepare before committing

Every binding first projects and validates its work without mutating live DOM.
Only a completely prepared component tree may commit. Nested components
participate in the same preparation. Projection and validation failures
therefore leave the preceding live tree unchanged and recoverable.

DOM commit is not presented as fully transactional because browser and custom
element setters may execute arbitrary side effects before throwing. A commit
failure faults that mounted component boundary instead of attempting an unsafe
general rollback.

### Explicit bindings form a DOM-aware update plan

Vue compiler patch flags and Angular binding slots identify owned update sinks,
while React's commit ordering ensures parent host work precedes dependent child
work. The explicit binding list provides the same ownership information
directly, without a compiler-generated tree.

Each scalar selector resolves all of its matches for every update. Independent
leaf rules prepare directly from read-only live DOM. When content rules can
invalidate another rule's targets, the current component DOM is imported into
an inert document and those rules are applied in ancestor order. Descendant
selectors resolve against that prepared parent result. This avoids stale
references when `textContent`, `innerHTML`, or their property equivalents
replace descendants, without copying the tree for ordinary leaf updates, and
it keeps projection failures from partially changing live DOM.

An unmatched scalar selector is an empty update. Exact duplicate sinks retain
declaration order and the last declaration wins; overlapping selector sets do
not need to be deduplicated. Parent selectors stop at `child` subtrees because
those nested bindings own their container contents.

Sources:

- [Vue renderer](https://github.com/vuejs/core/blob/main/packages/runtime-core/src/renderer.ts)
- [Angular binding slots](https://github.com/angular/angular/blob/main/packages/core/src/render3/bindings.ts)

### Properties reconcile with the live DOM

The previous projection alone is insufficient for browser-controlled
properties. A user can edit an input while the application's authoritative
value remains unchanged. Vue special-cases `value` against the element's
current value, and React tracks the current native `value` or `checked` state.

Every property binding follows the same rule: compare with the
live property on every update. It also records the property's value after a
write so browser coercion does not create redundant writes.

Sources:

- [Vue DOM property patching](https://github.com/vuejs/core/blob/main/packages/runtime-dom/src/modules/props.ts)
- [React input value tracking](https://github.com/react/react/blob/main/packages/react-dom-bindings/src/client/inputValueTracking.js)

### Executable sinks stay explicit

Angular rejects event-property bindings and applies security contexts to HTML,
URL, and resource bindings. Vue labels its raw HTML path unsafe, and React
requires the explicit `dangerouslySetInnerHTML` shape.

Generic bindings reject native event handler names and `srcdoc`. Event
handlers remain application-owned native listeners. `prop()` exposes native
structural properties, but `innerHTML` and `outerHTML` accept only genuine
`TrustedHTML` values authenticated by the mounted document. Lumi does not
create a policy or sanitize markup; those decisions remain at the application
boundary. Replacing a mounted component root through `outerHTML` is rejected
because it would destroy the persistent boundary. A partial URL sanitizer
would be unsafe because the correct policy depends on the element and resource
context. Applications must validate untrusted URLs at their data boundary.

Sources:

- [Angular sanitization](https://github.com/angular/angular/blob/main/packages/core/src/sanitization/sanitization.ts)
- [Vue DOM property patching](https://github.com/vuejs/core/blob/main/packages/runtime-dom/src/modules/props.ts)
- [React DOM property handling](https://github.com/react/react/blob/main/packages/react-dom-bindings/src/client/ReactDOMComponent.js)

## Kept out

### Reactivity, scheduling, and tree descriptions

Dependency tracking, queued rendering, concurrent work, compiler-generated
virtual nodes, and whole-tree reconciliation solve framework responsibilities
left to the application here. They do not improve the explicit
data-to-known-DOM-location operation enough to justify their runtime and
authoring models.

### Synthetic or delegated event systems

React delegates a broad event set at a root. Angular can coalesce multiple
handlers for one element and event. Vue stores stable invokers and includes a
timestamp guard for listeners attached during bubbling.

There is no synthetic event system. `on()` manages only where a native
listener lives and when it is released.

Sources:

- [React DOM event system](https://github.com/react/react/blob/main/packages/react-dom-bindings/src/events/DOMPluginEventSystem.js)
- [Angular listener instructions](https://github.com/angular/angular/blob/main/packages/core/src/render3/instructions/listener.ts)
- [Vue DOM events](https://github.com/vuejs/core/blob/main/packages/runtime-dom/src/modules/events.ts)

### Automatic property-versus-attribute inference

Vue includes element-specific rules for choosing between DOM properties and
attributes. React and Angular also maintain extensive DOM schemas. Keeping
`prop()` and `attr()` explicit avoids shipping a parallel browser schema and
makes ownership visible in ordinary JavaScript.
