# Lumi API

Implemented as browser-native ES modules in plain JavaScript, the package has
no runtime dependencies.

The API is experimental and may change while the design is validated.

## Public API boundary

The supported module is `@thlib/lumi`. It exports:

- `component`
- `bind`
- `event`
- `prop`
- `attr`
- `classToggle`
- `style`
- `child`
- The `Component`, `ComponentOptions`, and `MountedComponent` TypeScript types

`component()` returns a definition with `mount()`. A mounted component exposes
only `root`, `update()`, and `unmount()`.

Other source and declaration modules, renderer descriptors, preparation
objects, and connected-binding lifecycle shapes are package internals. They
exist to implement the public functions and may change without becoming Lumi
application APIs.

## Quick start

```js
import {
  bind,
  component,
  event,
  prop,
} from '@thlib/lumi'
import {jsonPath} from './plain.js'

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
    bind(
      '[data-bind]',
      (data, element) => jsonPath(data, element.dataset.bind),
    ),
    prop(
      '[data-disabled]',
      (data, element) => jsonPath(data, element.dataset.disabled),
      'disabled',
    ),
    event('[data-action="increment"]', 'click', () => {
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
    <output>count is <span data-bind="$.count">0</span></output>
    <button
      data-action="increment"
      data-disabled="$.counterDisabled"
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

`data-bind`, `data-disabled`, and `data-action` are application-owned hooks.
Their names and values are opaque. Both scalar projections receive the matched
element, and the example chooses to resolve
`element.dataset.bind` and `element.dataset.disabled` with its local
`jsonPath` helper.

The action value is likewise resolved by application code, but only as part of
the exact CSS selector `[data-action="increment"]`. There is no dynamic
function lookup or built-in event dispatcher.

The example-local `jsonPath` helper is not part of the public API.

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

Content-owning rules (`bind` and structural properties) are planned in DOM
ancestor order, independent of declaration order. Descendant selectors are
then resolved against the parent rule's
planned result. This lets a parent create content that a descendant rule
updates in the same render, and naturally skips a descendant removed by its
parent:

```js
bind('.person', () => 'Ada')
bind('.person .name', () => 'Lovelace')
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
| `bind(selector, project)` | text value, nested arrays, or nullish | Assigns text, repeats the matched element positionally, or does nothing for nullish |
| `prop(selector, project, name)` | any non-nullish value, or nullish | Assigns the native property with `Reflect.set`, or does nothing for nullish |
| `attr(selector, name, project)` | string, number, boolean, or nullish | Removes on `false`, creates an empty attribute on `true`, sets text, or does nothing for nullish |
| `classToggle(selector, name, project)` | boolean or nullish | Toggles only the named class, or does nothing for nullish |
| `style(selector, name, project)` | string or nullish | Sets one inline property, removes it for an empty string, or does nothing for nullish |

These declared projection results are validated during preparation. Scalar
`bind` and `attr` values must be strings, numbers, or booleans; `style`
requires strings; and `classToggle` requires a boolean. A `bind`
projection may additionally return arrays as described below. For every scalar
binding, `undefined` and `null` perform no DOM operation and leave the
corresponding state unchanged. Other invalid values throw a `TypeError` before
the update makes any DOM changes.

`prop` intentionally does not impose a generic value restriction. Native and
custom properties may legitimately accept objects and arrays, and the
property's setter remains responsible for accepting or coercing any
non-nullish value. Nullish values retain the existing property as described
above. Applications that require a narrower property contract should validate
it in the projection.

Bindings do not replace an element's complete class or style attribute. This
allows HTML, CSS, other bindings, and explicitly separate code to own other
parts of the same element.

Generic property and attribute bindings reject native event handler names such
as `onclick`. Attach behavior with `event()` or the browser's
`addEventListener()`. They also reject `srcdoc`.

Other native properties, including `innerHTML` and `outerHTML`, remain
available through `prop()`. Applications must establish trust or sanitize
untrusted markup before assigning `innerHTML`. Replacing the mounted component
root itself through `outerHTML` is rejected because it would invalidate the
mounted component boundary.

URL-valued properties and attributes such as `href`, `src`, and `action` remain
ordinary strings. Safe sanitization requires knowledge of the application's
trust and resource context. Applications must validate untrusted URLs before
including them in a render snapshot.

Every scalar projection receives `(data, element)`. The second argument is the
matching element in the prepared DOM view for that update. Applications can
inspect it to inject their own metadata conventions; HTML attribute
interpretation is not built in.

## `event(selector, type, handle, options?)`

`event` installs one native listener on the persistent component root when it
mounts and removes that listener when it unmounts. Events are delegated to the
closest matching element in their composed path:

```js
event('[data-action="save"]', 'click', (nativeEvent, button) => {
  nativeEvent.preventDefault()
  save(button.getAttribute('data-id'))
})
```

The handler receives the native event and the matching element. Bare tag
selectors provide the corresponding element type in TypeScript, and known
native event names provide their specific event type.

Delegation means one stable handler continues to cover matching elements
created or repeated by later updates. It also means the event must bubble to
the component root, unless capture is enabled in `options`. The optional
boolean or `AddEventListenerOptions` value is passed directly to
`addEventListener()` and used again for cleanup.

The selector is scoped to the component's current DOM, includes the component
root itself, and follows open Shadow DOM in the same way as scalar bindings.
There is no synthetic event object, dynamic function lookup, or automatic
update: the application handler owns its state transition and calls
`mounted.update()` when needed.

## Array-valued bind projections

When `bind` receives an array, the matched element repeats once for each entry.
An empty array produces zero elements. An internal non-element range anchor
lets later updates add elements at the same location.

A nullish bind projection is a no-op and preserves the current region.
Nullish entries inside an array are invalid because each array entry defines
one repeated occurrence.

```js
bind('.item', data => data.items)
```

```html
<ul>
  <li class="item">Default item</li>
</ul>
```

Text entries become the repeated elements' `textContent`. Object and nested
array entries establish structural context and preserve the element's
descendants for nested bindings:

```js
bind('.group', data => data.groups)
bind('.name', data => data.groups.map(group => {
  return group.map(person => person.name)
}))
```

```html
<section class="group">
  <span class="name">Default name</span>
</section>
```

Every repeated occurrence has a positional coordinate such as `[1, 2]`.
Nested projection arrays consume those coordinates. Scalar descendant
projections broadcast to every occurrence below them. Ragged nested arrays
are valid, and an empty inner array removes only the elements at that inner
level.

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

## Injecting an application binding convention

The smallest convention can map application-owned metadata directly to
presentation object properties:

```js
function bindFields() {
  return bind(
    '[data-field]',
    (data, element) => data[element.dataset.field],
  )
}
```

```html
<output>count is <span data-field="count">0</span></output>
```

That convention belongs entirely to the application. If it projects a missing,
`undefined`, or `null` field, Lumi leaves the corresponding DOM state
unchanged.

The counter example chooses a more elaborate option by defining `jsonPath()`
in its own `plain.js`. The projection receives the matched element and injects
the example's path behavior:

```js
function bindPaths() {
  return bind(
    '[data-bind]',
    (data, element) => jsonPath(data, element.dataset.bind),
  )
}

function disabledPaths() {
  return prop(
    '[data-disabled]',
    (data, element) => jsonPath(data, element.dataset.disabled),
    'disabled',
  )
}

const definition = component({
  template,
  bindings: [
    bindPaths(),
    disabledPaths(),
  ],
})
```

The path behavior belongs to `jsonPath`, not `bind`. The counter's helper
chooses to distribute named members through arrays, so `$.items.name` returns
an array with the same shape as `items`. Another application may use direct
projections, external binding maps, another metadata convention, or no helper
at all.

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

- A `bind` declaration owns positional element cardinality and scalar
  `textContent`.
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

Selector syntax errors remain native `DOMException`s from the browser.

## Browser requirements

The current implementation targets modern browsers with native support for ES
modules, `<template>`, Shadow DOM, selectors, `importNode`, `classList`,
`addEventListener`, `Map`, `Set`, and `Reflect`.

Compatibility shims are not included in the first implementation. They can be
added below the public API without changing component definitions.
