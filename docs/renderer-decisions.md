# Renderer decisions from framework research

This note records implementation choices made after reviewing the Vue, React,
Angular, and Solid renderers. The selected mechanisms strengthen declarative DOM
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

### Text compares with the last written value

Solid 2 does not read the DOM to find if a text write is necessary. Its
`insertExpression` function compares the new value with the value that it last
inserted. When the value is different, it sets the `data` of the existing text
node. For text nodes in an array, Solid keeps the last value in a property on
the node.

A `text` binding follows the same rule. Lumi keeps the last written text in a
symbol property on the element. An update with the same projection does not
touch the DOM. An update with a different projection sets the `data` of the
text node when that node is the only child, so the node persists. An empty
value removes the child nodes, as `textContent` does.

In a profile of a large keyed `repeat`, the `textContent` read was the largest
single cost of an update. A `WeakMap` removed the read but made the first
render slower. A symbol property is faster in both cases.

Two parts are different from Solid:

- On the first update of an element, Lumi reads `textContent` one time. The
  update then writes nothing when the source content is already correct.
  Solid writes without a read and has a separate hydration mode.
- Before Lumi sets `data`, it makes sure that the only child is a text node.
  Solid assumes that its text node is still there.

The cost is that Lumi does not repair a foreign write to a text sink. Text has
one writer, so a foreign write breaks the ownership rule. It is not user
input. Properties keep the live comparison for that reason.

Source:

- `insertExpression` in [`@solidjs/web`](https://www.npmjs.com/package/@solidjs/web)
  2.0.3, file `dist/web.js`

### An update with the same keys does little work for each row

Solid 2 keeps a row when its item did not change, and it finds an unchanged
start of a list with one comparison for each position. Solid can skip the
row because its store reports each write. An application can change a plain
object in place, so for plain data Lumi must run the projections of each row
on each update. The result must depend only on the content of the data.

Lumi applies the part of the idea that keeps this result. It makes the work
for each row small:

- When the keys are equal to the keys of the last update, position for
  position, the duplicate check and the reconciliation build no lookup. The
  lookup starts at the first key that is different.
- A plan holds one value for each sink. It holds no object for each sink.
- The positional `path` of a context is built only when a projection reads
  it.

The check of the live DOM order stays, so an update still repairs a reorder
that other code made.

Source:

- `mapArray` in [`@solidjs/signals`](https://www.npmjs.com/package/@solidjs/signals)
  2.0.3

### Tracked data updates only the parts that read a write

Solid 2 does not go through the rows when one value changes. Its store is a
`Proxy`. A read through the store records which computation uses a property,
and a write through the store runs only those computations. Solid 2 collects
the writes and applies them in a microtask, and `flush()` applies them
immediately.

Lumi does the same for data from `tracked(data)`. The decisions are:

- **Tracking is the choice of the application for each data object.** Plain
  data has no Proxy and no record, so `update(data)` has the same cost and the
  same result as before.
- **The view wraps the object of the application.** Writes go to that object,
  and the object holds plain values only. Lumi keeps the view and the records
  in `WeakMap` objects and adds no property to the data.
- **A row is one part.** Solid 2 keeps one record for each binding. Lumi keeps
  one record for each row, each item list, the component scope, and each
  `child` binding. One write to a row calls the projections of that row. This
  fits the planner, which prepares and commits a row as one unit.
- **A list keeps a row when its item is the same tracked object.** This is the
  comparison that `mapArray` makes. It is safe for tracked data only, because
  Lumi sees each change of a tracked object. For an item that is not tracked,
  Lumi calls the projections again.
- **The key belongs to the row.** A row records the reads of its key
  projection. When a write changes the key, Lumi prepares the list.
- **A native method that changes a list runs on the plain list.** Through a
  Proxy, `splice` reads and writes each element with one trap call. Lumi calls
  the method on the plain list and notifies the readers one time.
- **Preparation and commit stay separate.** Lumi prepares all changed parts of
  a component before it writes to the DOM. A failure changes no DOM.
- **Managed listeners are reconciled only when necessary.** A change inside
  rows cannot add an event boundary. Lumi reconciles the listeners after a
  list change, after a change outside the lists, and when the component has
  a listener with `{at: 'elements'}`.

Measured in Chrome with 10,000 keyed rows of four bindings: one changed row
needs 3.8 ms with `update(data)` and 0.005 ms with a tracked write. The first
render of tracked data is approximately 25% slower, because Lumi makes one
view and one record for each row.

Source:

- `createStore` and `mapArray` in
  [`@solidjs/signals`](https://www.npmjs.com/package/@solidjs/signals) 2.0.3

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

### Tree descriptions

Compiler-generated virtual nodes and whole-tree reconciliation put a second
model of the document beside the native DOM. Bindings already identify the
DOM locations to update, so Lumi works on the native DOM directly.

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
