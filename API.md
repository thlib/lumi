# Lumi API

Implemented as browser-native ES modules in plain JavaScript, the package has
no runtime dependencies.

The API is experimental and may change while the design is validated.

## Public API boundary

The supported module is `@thlib/lumi`. It exports:

- `component`
- `repeat`
- `text`
- `on`
- `prop`
- `attr`
- `classToggle`
- `style`
- `child`
- The `Component`, `ComponentOptions`, `MountedComponent`, and
  `ProjectionContext` TypeScript types, plus `EventBindingOptions`,
  `EventBindingLocation`, and `EventBindingFrequency`

`component()` returns a definition with `mount()`. A mounted component exposes
only `root`, `update()`, and `unmount()`.

Other source and declaration modules, renderer descriptors, preparation
objects, and connected-binding lifecycle shapes are package internals. They
exist to implement the public functions and may change without becoming Lumi
application APIs.

## Quick start

```js
import {
  component,
  on,
  prop,
} from '@thlib/lumi'

let actualData = {
  count: 0,
  maximum: 5,
}

function presentCounter(data) {
  return {
    count: data.count,
    counterDisabled: data.count >= data.maximum,
  }
}

const slot = document.querySelector('#counter-slot')

const counter = component({
  template: document.querySelector('template'),
  bindings: [
    text('output span', ({data}) => data.count),
    prop(
      '[data-disabled]',
      ({data}) => data.counterDisabled,
      'disabled',
    ),
    on('[data-action="increment"]', 'click', () => {
      actualData = {
        ...actualData,
        count: actualData.count + 1,
      }
      counter.update(presentCounter(actualData))
    }),
  ],
}).mount(slot)

counter.update(presentCounter(actualData))
```

The template declares the direct value binding and keeps its useful default
content:

```html
<template>
  <section class="counter">
    <output>count is <span>0</span></output>
    <button
      data-action="increment"
      data-disabled
    >Increment</button>
  </section>
</template>
```

`presentCounter()` is owned by the counter component. It derives the exact
presentation snapshot required by that component from actual application
data. Derived values such as `counterDisabled` are recomputed rather than
maintained as a second source of truth.

For a component tree, each component owns the shape and derivation of its own
presentation data. A page presentation function composes those component
presentation functions into the snapshot passed to the root component.
Presentation functions run before rendering; only their results are passed
through, with no reference to the actual data that produced them.

The component options identify native DOM, declare data-to-DOM projections,
and register native event handlers. The explicit `update()` call supplies the
presentation snapshot. State transitions remain ordinary application
JavaScript.

`data-disabled` and `data-action` are application-owned hooks. Their names and
values are opaque. The bindings in this quick start project the presentation
snapshot directly with ordinary JavaScript functions.

The action value is likewise resolved by application code, but only as part of
the exact CSS selector `[data-action="increment"]`. There is no dynamic
function lookup or built-in event dispatcher.

Application conventions, including the optional JSONPath adapter shown below,
are not part of the public API.

## `component(options)`

`component` creates a reusable definition. It does not clone or modify the
template until an instance is mounted.

The template must contain exactly one root element. That root is the component
boundary used for scoped selectors and nested rendering.

```js
const definition = component({
  template,
  bindings: [],
})
```

The bindings array is optional.

### `definition.mount(target)`

`mount` deep-clones the template, replaces the target's existing contents with
its single root element, resolves the bindings, and returns a mounted
component. The mounted component owns the target contents for its lifetime. If
connecting a binding fails, Lumi removes the clone and restores the preceding
target contents.

The target and template may be direct `querySelector` results. A clear error is
thrown if either is missing or the template does not contain exactly one root
element.

### `mounted.update(data)`

`update` is synchronous and has separate preparation and commit phases.

Preparation evaluates every built-in scalar projection, recursively prepares
child components, and calculates the necessary DOM work. When content rules
have structural dependencies, the component DOM is imported into an inert
document where those dependencies can be resolved. Independent leaf rules use
the live DOM only as a read-only preparation view. Preparation does not mutate
live DOM or construct another instance of a live custom element. If any
projection or validation fails, the prepared work is discarded, the mounted
component tree remains unchanged, and a later update is still permitted.

Commit begins only after the complete active component tree prepares
successfully. Each binding compares its projected value with the corresponding
DOM state and writes only when the value differs. Bindings cache values where
the browser cannot change the owned state independently.

Property bindings also compare against the live property on every update.
This lets authoritative data restore a user-mutated `value`, `checked`, or
similar browser state. The binding remembers the browser's post-assignment value so
native coercion does not cause a repeated write.

Arbitrary DOM operations are not fully transactional. A native or custom
element setter can execute application code, mutate browser state, and then
throw. That work cannot be safely rolled back. If commit fails, the mounted
component is marked faulted: it may be unmounted, but it cannot be updated
again. The application must mount a fresh component boundary.

Rendering remains synchronous and explicit, with no retained subscriptions
to the data object.

### `mounted.unmount()`

`unmount` destroys connected bindings, unmounts owned child components, and
removes the component root. Repeated calls have no effect. Updating after
unmount throws.

## Scalar bindings

Each scalar binding resolves every matching element during each update. The
component root itself also participates in selector matching. A selector with
no matches is a no-op: its projection does not run and the update continues.

Resolution recursively enters open shadow roots below the component boundary,
so the same bindings and `child` declarations work for elements owned by a
custom element's open Shadow DOM. Closed shadow roots remain encapsulated and
are not observable to Lumi. Native CSS scoping still applies: Lumi searches
each open tree, but a single selector cannot express an ancestor relationship
across a shadow boundary.

Content-owning rules (`text` and structural properties) are planned in DOM
ancestor order, independent of declaration order. Descendant selectors are
then resolved against the parent rule's
planned result. This lets a parent create content that a descendant rule
updates in the same render, and naturally skips a descendant removed by its
parent:

```js
text('.person', () => 'Ada')
text('.person .name', () => 'Lovelace')
```

Here the first rule removes `.name` through native `textContent` semantics.
The second selector consequently has no matches and performs no update.
Structural property names currently recognized by the planner are
`innerHTML`, `outerHTML`, `textContent`, and `innerText`.

The projection runs once for each match in the prepared DOM view and
receives that matching element as its second argument. For independent rules
this may be the read-only live match; for structural dependencies it is an
inert planning counterpart. Projection code may inspect stable template
metadata such as `data-*` attributes, but should not retain the element,
depend on its identity, or mutate it.

In TypeScript, a bare HTML, SVG, or MathML tag selector gives the projection
the corresponding native element type. Complex selectors safely fall back to
`Element`, as native selector APIs do.

| Binding | Projection result | DOM effect |
| --- | --- | --- |
| `repeat(selector, project, bindings?)` | array or nullish | Repeats the matched template element once per item; optional built-in DOM bindings are scoped to those occurrences |
| `text(selector, project)` | text value or nullish | Assigns `textContent`, or preserves it for nullish and invalid values |
| `prop(selector, project, name)` | any non-nullish value, TrustedHTML for `innerHTML`/`outerHTML`, or nullish | Assigns the native property with `Reflect.set`, or does nothing for nullish |
| `attr(selector, name, project)` | string, number, boolean, or nullish | Removes on `false`, creates an empty attribute on `true`, sets text, or does nothing for nullish |
| `classToggle(selector, name, project)` | boolean or nullish | Toggles only the named class, or does nothing for nullish |
| `style(selector, name, project)` | string or nullish | Sets one inline property, removes it for an empty string, or does nothing for nullish |

Every render projection receives the same context object: `data`, `item`,
`index`, `path`, and `parent`; `el` remains its second argument. `repeat` is
the only binding that interprets an array structurally. `undefined` and `null`
perform no DOM operation and leave the corresponding state unchanged. Invalid
`repeat`, `text`, `attr`, `classToggle`, and `style` results also perform no
operation and produce a deduplicated development warning. TrustedHTML property
validation remains a preparation-time error.

Except for HTML injection sinks, `prop` intentionally does not impose a
generic value restriction. Native and custom properties may legitimately
accept objects and arrays, and the property's setter remains responsible for
accepting or coercing any non-nullish value. Nullish values retain the existing
property as described above. Applications that require a narrower property
contract should validate it in the projection.

Bindings do not replace an element's complete class or style attribute. This
allows HTML, CSS, other bindings, and explicitly separate code to own other
parts of the same element.

Generic property and attribute bindings reject native event handler names such
as `onclick`. Attach behavior with `on()` or the browser's
`addEventListener()`. They also reject `srcdoc`.

`innerHTML` and `outerHTML` remain available through `prop()`, but their
projections must return a genuine `TrustedHTML` object. Lumi authenticates the
value with `trustedTypes.isHTML()` from the mounted document's realm during
preparation and passes the same object to the native property setter. Ordinary
strings and lookalike objects are rejected before any live DOM write. If that
realm does not expose the Trusted Types API, these property bindings fail
closed.

The application owns the policy and any required sanitization:

```js
const markupPolicy = trustedTypes.createPolicy('application-markup', {
  createHTML: value => sanitizeMarkup(value),
})

prop(
  '.preview',
  ({data}) => markupPolicy.createHTML(data.markup),
  'innerHTML',
)
```

Replacing the mounted component root itself through `outerHTML` is still
rejected because it would invalidate the mounted component boundary.

URL-valued properties and attributes such as `href`, `src`, and `action` remain
ordinary strings. Safe sanitization requires knowledge of the application's
trust and resource context. Applications must validate untrusted URLs before
including them in a render snapshot.

Every scalar projection receives `(data, element)`. The second argument is the
matching element in the prepared DOM view for that update. Applications can
inspect it to inject their own metadata conventions; HTML attribute
interpretation is not built in.

## `on(selector, type, handler, options?)`

`on` declares one native event relationship inside Lumi-owned DOM. Lumi owns
listener placement and cleanup; the browser owns event behavior. Like every
other binding, the declaration names the DOM it owns first.

```js
on('[data-action="save"]', 'click', (nativeEvent, button) => {
  nativeEvent.preventDefault()
  save(button.getAttribute('data-id'))
})
```

The handler receives the original native event and the matched element. Bare
tag selectors provide the corresponding element type in TypeScript, and known
native event names provide their specific event type. The return value is
ignored, so cancellation stays explicit.

The options object defaults to:

```js
{
  at: 'component',
  capture: false,
  passive: false,
  freq: 'always',
}
```

`capture` and `passive` are applied to the native listener Lumi registers.

### `at: 'component'`

The default routes matching events through the component's own event
boundaries. One managed listener keeps covering matching elements created,
repeated, or moved by later updates, and no listener has to be reconnected
when repeated elements change.

Lumi reads the event's composed path, restricts it to DOM the component owns,
excludes DOM owned internally by nested Lumi components, and invokes each
matching binding once with the closest matching path element. The mounted
component root participates in matching.

Compatible declarations share one logical router. The grouping key is the
component event boundary, event type, `capture`, and `passive`; `once` is
binding state rather than part of the key.

```js
bindings: [
  on('.save', 'click', save),
  on('.delete', 'click', remove),
  on('[data-track]', 'click', track),
]
```

Bindings sharing a router run in their declaration order. Because they are
callbacks inside one native listener, `stopImmediatePropagation()` does not
suppress a sibling binding dispatched by the same router; `preventDefault()`
and `stopPropagation()` keep their native behavior. Code that needs exactly
independent native listeners should combine the behavior in one handler or use
`at: 'elements'`.

`event.currentTarget` is the routing boundary and is never rewritten, because
that would require a wrapped event object. Use the handler's second argument
for the matched element.

### `at: 'elements'`

```js
on('video', 'ended', finishPlayback, {
  at: 'elements',
})
```

maintains native listeners on every matching Lumi-owned element. The plural is
intentional: a selector may match zero, one, or many elements, and that set is
reconciled after mount and after every successful update. Newly matching
elements gain listeners, elements that stop matching lose them, and removed
elements are released along with Lumi's references to them. A failed
preparation cannot change listener membership.

This is the correct choice when the event does not bubble, when
`event.currentTarget` must be the matching element, or when native
target-listener ordering and `stopImmediatePropagation()` behavior matter.

Lumi never translates one event type into another and never silently selects
capture for a non-bubbling type. `on('input', 'focus', handler)` is not
rewritten as `focusin`. In development, a component declaration for a
well-known non-bubbling type produces a warning suggesting `{at: 'elements'}`
or `{capture: true}`; custom event names remain valid because a `CustomEvent`
chooses its own `bubbles` value.

### `freq`

How often a declaration may run is an enum rather than a boolean, and it
replaces the native `once` listener option:

```js
on('video', 'ended', finishPlayback, {
  at: 'elements',
  freq: 'once',
})
```

`'always'` is the default. `'once'` means the declaration may invoke its
handler at most once during the lifetime of this mounted component — not once
per matching element, native listener, render, or reattachment. Lumi consumes
the binding immediately before invoking the handler, so reentrant dispatch
cannot reach it again and a throwing handler stays consumed. Consuming an
element binding removes its listeners from every matching element; consuming a
component binding removes only its own route from the shared router. A new
mount of the same declaration starts a fresh once lifetime.

Lumi never passes a native `once` to a shared router, which would remove the
whole router after one event, and never relies on per-element native `once`,
which would mean once per element instead of once per declaration.

### Lifecycle and boundaries

Selectors are scoped to the component's current DOM, include the component
root, and follow open Shadow DOM in the same way as scalar bindings. A
component may own more than one event tree, so Lumi maintains compatible
routers in reachable open shadow roots too, and still invokes a binding at
most once per native event. Closed shadow roots stay encapsulated.

Parent selectors do not match inside a child component's owned subtree; the
child mount container itself remains available to the parent. Unmount
disconnects every router, removes every element listener, and releases the
handler, element, and once state. A handler may unmount its own component,
after which the remaining bindings of that component are not invoked.

A routed handler that throws is reported through the host's uncaught-error
reporting rather than aborting the other bindings sharing its router. Element
listeners keep native listener error behavior.

Lumi manages events only on DOM it owns. `window`, `document`, media queries,
and sockets remain ordinary `addEventListener()` subscriptions owned by the
application.

There is no synthetic event object, event pooling, dynamic function lookup, or
automatic update: the application handler owns its state transition and calls
`mounted.update()` when needed.

## Repeated occurrences

`repeat` creates one occurrence of the matched element for each projected
array entry. An empty array produces zero elements. An internal non-element
range anchor lets later updates add elements at the same location. A nullish
or non-array result is a recoverable no-op that preserves the region.

```js
repeat('.item', ({data}) => data.items)
text('.item', ({item}) => item.name)
```

For a local reading order, `repeat` may take its built-in DOM bindings as an
optional third argument. Those bindings resolve their selectors only inside
the repeated template element, and their projections receive that occurrence's
context. The repeated element participates in matching, so `:scope` selects
that element itself:

```js
repeat('.item', ({data}) => data.items, [
  text('.name', ({item}) => item.name),
])
```

`on` and `child` remain component-level declarations. A repeat binding list
accepts `repeat`, `text`, `prop`, `attr`, `classToggle`, and `style`; all of
them receive the repeated occurrence's context.

Flat bindings remain useful when the template position is already clear:

```js
repeat('.item', ({data}) => data.items)
text('.item .name', ({item}) => item.name)
```

Here context follows the matched DOM position. The nested form instead makes
the owning repeat explicit, so a local `.name` cannot also match a `.name`
elsewhere in the component.

```html
<ul>
  <li class="item">Default item</li>
</ul>
```

Each entry establishes structural context and preserves the element's
descendants. Nested arrays remain ordinary item values until a nested repeat
consumes them:

```js
repeat('.group', ({data}) => data.groups)
repeat('.name', ({item: group}) => group)
text('.name', ({item: person}) => person.name)
```

```html
<section class="group">
  <span class="name">Default name</span>
</section>
```

Every repeated occurrence has a positional coordinate such as `[1, 2]`.
Ragged nested arrays are valid, and an empty inner array removes only the
elements at that inner level.

Repeated elements are reconciled by array position. Reordering changes the
data represented by existing positions. Existing positions retain their native
DOM nodes; appends create trailing nodes and truncation removes trailing nodes.

This positional identity is the public contract. Lumi does not recognize a
`key` or `id` property, compare object identity, accept a key function, or move
occurrences to follow application records. Reordering an array updates the data
represented by each existing position.

Array cardinality cannot replace the mounted component root, whose public
boundary is one persistent `Element`. It applies to descendants of that root.
The repeatable target must exist in the component template to provide a
pristine element to clone. Projection and coordinate validation complete
before the live DOM changes.

## Explicit positional contexts

`repeat` separates positional cardinality from text. Its projection receives
the nearest occurrence context and returns the items at that template
location. `text` receives the same context and owns only `textContent`:

```js
repeat('.group', ({data}) => data.groups)
repeat('.person', ({item}) => item.people)
text('.name', ({item}) => item.name)
text('.currency', ({data}) => data.currency)
```

The context contains `data`, `item`, `index`, `path`, and `parent`. At the
component root, `item === data`, `index === 0`, `path` is empty, and `parent`
is null. Every repeat preserves `data`, sets `item` to the current entry, and
extends the positional path.

Only `repeat` interprets an array structurally. Nested arrays remain ordinary
items until a nested `repeat` consumes them. A non-array repeat result or a
non-text text result is a recoverable no-op: Lumi preserves the existing DOM
and emits one development warning per mounted declaration and received value
category.

## Injecting an application binding convention

The smallest convention can map application-owned metadata directly to
presentation object properties:

```js
import {text} from '@thlib/lumi'

function bindFields() {
  return text(
    '[data-field]',
    ({data}, el) => data[el.dataset.field],
  )
}
```

```html
<output>count is <span data-field="count">0</span></output>
```

That convention belongs entirely to the application. If it projects a missing,
`undefined`, or `null` field, Lumi leaves the corresponding DOM state
unchanged.

The JSONPath counter chooses a more elaborate option by wrapping an external
RFC 9535 implementation in `examples/data-path.js`. The projection receives
the matched element and injects the application's path behavior:

```js
import {repeat, text} from '@thlib/lumi'
import {jsonPath} from './examples/data-path.js'

function exactlyOne(values) {
  return values.length === 1 ? values[0] : undefined
}

function bindDataPaths() {
  return [
    repeat('[data-repeat]', ({item}, el) => {
      return jsonPath(item, el.dataset.repeat)
    }),
    text('[data-text]', ({item}, el) => {
      return exactlyOne(jsonPath(item, el.dataset.text))
    }),
  ]
}

const definition = component({
  template,
  bindings: [
    ...bindDataPaths(),
  ],
})
```

The path behavior belongs to JSONPath, not Lumi. The adapter caches parsed
queries and preserves JSONPath's nodelist cardinality. `repeat` consumes the
whole nodelist while `text` selects exactly one result. Paths are evaluated
against the current item, which is the component data outside a repeated
region. Another application may use direct projections, external binding
maps, another metadata convention, or no helper at all.

These factories compose Lumi's public functions; they do not add a second
component or rendering lifecycle. Lumi does not reserve their attributes,
inspect their path strings, or require applications to use such a convention.

## `child(selector, component, project)`

`child` mounts one nested component into the selected container. The
projection selects the child's data from the parent snapshot:

```js
child('.profile-slot', profileComponent, page => page.profile)
```

The child root is mounted once and persists across parent renders. The
container must not initially contain another element.

## DOM ownership

A binding writes only the DOM sink named by that binding:

- A `repeat` declaration owns positional element cardinality.
- A `text` declaration owns scalar `textContent`.
- A property binding owns one property.
- A class binding owns one class token.
- A style binding owns one style property.
- A child binding owns the element children of its container.

Built-in scalar declarations may overlap. Different sinks on the same element
are independent. When multiple built-in declarations write the same sink on
the same element, declaration order is deterministic and the last declaration
wins. Both writes may occur; authors do not need to deduplicate overlapping
selector sets.

Properties and attributes remain explicitly different sink kinds even where
the browser reflects one into the other, such as `disabled`. If a component
deliberately binds both, they are replayed in declaration order and native DOM
reflection determines the result.

Content rules are the exception to ordinary declaration ordering: an ancestor
content rule is prepared and committed before rules selecting its descendants.
Rules at the same element retain declaration order. Selectors are re-resolved
against the prepared parent result before descendant projections run.

Parent rules do not select inside a subtree owned by `child`.
Writing content on that container or one of its ancestors would detach a live
nested component, so the update is rejected during preparation.

Unbound state remains under browser or application ownership. Imperative code
should not write a property or subtree already owned by a binding.

## Errors

An error is thrown when:

- A template has zero or multiple root elements.
- A `child` container selector does not match within the component root.
  Unmatched scalar selectors are no-ops.
- A child container already contains an element.
- A parent content rule would replace a child subtree.
- A property binding attempts to replace its mounted component root through
  `outerHTML`.
- An update is recursive or targets an unmounted or faulted component.
- A DOM property cannot be assigned.
- A generic binding targets an event handler or `srcdoc`.
- An `innerHTML` or `outerHTML` projection is not genuine `TrustedHTML`, or
  the mounted document cannot authenticate it.
- An event declaration has a non-string type or selector, a handler that is
  not callable, options that are not an object, an unsupported option name, or
  an invalid `at`, `capture`, `passive`, or `freq` value. The message
  identifies the event type, the selector, and the invalid property:

  ```text
  Invalid Lumi event binding for "ended" on "video": options.at must be
  "component" or "elements"
  ```

An event selector is validated when the component connects, even when it
currently has no matches, so an invalid declaration fails mount atomically.

If application projection code throws, Lumi rethrows an error that identifies
the binding kind, selector, and one-based matched position. The original
thrown value is available as its `cause`.

Selector syntax errors remain native `DOMException`s from the browser.

## Browser requirements

The current implementation targets modern browsers with native support for ES
modules, `<template>`, Shadow DOM, selectors, `importNode`, `classList`,
`addEventListener`, `Map`, `Set`, and `Reflect`.

Compatibility shims are not included in the first implementation. They can be
added below the public API without changing component definitions.
