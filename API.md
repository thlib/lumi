# Lumi API

Implemented as browser-native ES modules in plain JavaScript, the package has
no runtime dependencies.

The API is experimental and may change while the design is validated.

## Public API boundary

The supported module is `@thlibjs/lumi`. It exports:

- `component`
- `repeat`
- `text`
- `on`
- `prop`
- `attr`
- `classToggle`
- `style`
- `child`
- The `Component`, `ComponentOptions`, `ComponentSource`, `MountedComponent`, and
  `ProjectionContext` TypeScript types, plus `EventBindingOptions`,
  `EventBindingLocation`, and `EventBindingFrequency`

`component()` returns a definition with `mount()`. A mounted
component exposes only `root`, `update()`, and `unmount()`.

The package also exports browser shims, for example
`@thlibjs/lumi/shims/move-before.js`. Refer to
[Browser requirements](#browser-requirements).

The module `@thlibjs/lumi/check.js` has a check for tests. It is not in the
Lumi bundle. Refer to [Selector check](#selector-check).

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
  text,
} from '@thlibjs/lumi'

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
  source: document.querySelector('template'),
  bindings: [
    text('output span', ({data}) => data.count),
    prop(
      '[data-disabled]',
      'disabled',
      ({data}) => data.counterDisabled,
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
source until an instance is mounted.

The `source` option accepts parsed DOM in one of these forms:

- An `HTMLTemplateElement`. Its inert `content` is cloned.
- A `DocumentFragment`. Its children are cloned.
- An `Element`. The element itself is cloned.

A source must have a root element. That root is the component boundary used
for scoped selectors and nested rendering. When a source has more than one
root element, the component uses the first one, and the development version
gives a warning. Lumi never consumes, moves, or inserts the source itself.

```js
const definition = component({
  source: template,
  bindings: [],
})
```

The bindings array is optional.

### `definition.mount(target)`

`mount` deep-clones the source, replaces the target's existing contents with
its single root element, resolves the bindings, and returns a mounted
component. The mounted component owns the target contents for its lifetime. If
connecting a binding fails, Lumi removes the clone and restores the preceding
target contents. The error then goes to the caller of `mount`.

The target is an element or a document fragment. A shadow root is a document
fragment. When you insert a document fragment into a document, the component
root moves with the other child nodes of the fragment, and the component
stays mounted. The target and an element or
template source may be direct `querySelector` results. If the target or the
source is missing, the development version gives a clear error, and the
production version gives the error of the browser. A connected and a detached
element have the same source semantics: `mount` clones them and does not
adopt them.

### `mounted.update(data)`

`update` is synchronous and has separate preparation and commit phases.

Preparation evaluates every built-in projection, recursively prepares child
components, and calculates the necessary DOM work. When a component has a
markup binding (`innerHTML` or `outerHTML`), preparation also applies the
planned values to an inert copy of the component source. That copy shows the
elements that the markup creates. Preparation does not mutate live DOM or
construct another instance of a live custom element. If any projection or
validation fails, the prepared work is discarded, the mounted component tree
remains unchanged, and a later update is still permitted.

Commit begins only after the complete active component tree prepares
successfully. A `text`, `attr`, `classToggle`, or `style` binding remembers
the value that it wrote. When the next projected value is equal to that
value, the binding does not read or write the DOM. When the value is
different, the binding compares it with the DOM state and writes only a
difference. When two bindings write the same state of one element, they do
not remember: each compares with the DOM state on each update, and the last
declaration wins.

A `prop` binding compares with the live property on each update.
This lets authoritative data restore a user-mutated `value`, `checked`, or
similar browser state. Use `prop`, not `attr`, for a state that the browser
changes, for example the `open` state of a `<details>` element. The binding remembers the browser's post-assignment value so
native coercion does not cause a repeated write.

Arbitrary DOM operations are not fully transactional. A native or custom
element setter can execute application code, mutate browser state, and then
throw. That work cannot be safely rolled back. If a commit fails, the error
goes to the caller, and the DOM has the writes that were complete before the
error. The component stays mounted. The next update compares its values with
the DOM again and writes the differences.

An update that starts while the same component is in an update gives error
`E13`. This occurs when a projection or a property setter calls `update` or
`unmount` on its own component.

Rendering remains synchronous and explicit, with no retained subscriptions
to the data object.

### `mounted.unmount()`

`unmount` destroys connected bindings, unmounts owned child components, and
removes the component root. Repeated calls have no effect. An update after
the unmount does nothing.

## Scalar bindings

Each binding resolves its selector one time, when the component mounts. The
selector resolves in the component source, before an update writes to it. The
binding then owns the elements that it matched, for the life of the mounted
component. The component root itself also participates in selector matching.
A selector with no matches is a no-op: its projection does not run and the
update continues. A selector that is not valid fails the mount.

A later change of the DOM does not change the matches. An element that other
code adds is not a target. A selector also cannot follow state that an update
writes:

```js
classToggle('.row', 'open', ({data}) => data.open)
// This matches only a row that has the class `open` in the source.
text('.row.open .label', ({data}) => data.label)
```

Use a selector that does not depend on state, and put the condition in the
projection. A nullish result keeps the current DOM state:

```js
text('.row .label', ({data}) => data.open ? data.label : null)
```

Markup is the exception. An `innerHTML` or `outerHTML` binding can create
elements. In each update, the selectors of the component resolve again for
the elements that the markup created.

Resolution stops at each shadow root, as a native selector does. The contents
of a shadow root belong to the element that attached it. A binding or a
`child` declaration does not match an element in a shadow root, open or
closed. The light DOM children of a shadow host stay in the component tree,
and bindings match them. This includes slotted content.

To render the contents of a shadow root that you own, mount a component on
that shadow root, or on an element in it. The selectors of the component then
resolve in the shadow tree, and the styles of the shadow root apply to the
component:

```js
const styles = new CSSStyleSheet()
styles.replaceSync('h2 { margin: 0 }')

class TeamCard extends HTMLElement {
  constructor() {
    super()
    const shadow = this.attachShadow({mode: 'open'})
    shadow.adoptedStyleSheets = [styles]
    this.view = teamCard.mount(shadow)
  }
}
```

A mount replaces the child nodes of its target, which includes a `<style>`
element in a shadow root. An adopted style sheet is not a child node, so it
stays. To keep other child nodes of a shadow root, mount the component on an
element in the shadow root:

```js
shadow.innerHTML = '<style>h2 { margin: 0 }</style><div></div>'
this.view = teamCard.mount(shadow.lastElementChild)
```

A `text` binding and the properties `innerHTML`, `outerHTML`, `textContent`,
and `innerText` replace the contents of their element. A descendant that
such a write removes stays a target of its bindings, but it is not in the
document, so a write to it has no visible effect:

```js
text('.person', () => 'Ada')
text('.person .name', () => 'Lovelace')
```

Here the first rule removes `.name` through native `textContent` semantics.
The projection of the second rule runs, and its value goes to the removed
element.

A markup write is applied before the other bindings, and an ancestor before
a descendant, independent of declaration order. Thus markup that is equal to
the current content replaces no element, and a rule for a descendant can
update the content that a parent created in the same render.

An `outerHTML` binding replaces its target. The binding then owns the element
that took the place of the target. Markup that does not have exactly one
element leaves the binding without an element.

The projection runs once for each target and receives an element as its
second argument. In a component without `repeat`, without `child`, and
without a markup binding, this is the mounted element. In other components,
it is the corresponding element of an inert copy of the component source.
Projection
code may inspect stable template metadata such as `data-*` attributes, but
should not retain the element, depend on its identity, or mutate it.

In TypeScript, a bare HTML, SVG, or MathML tag selector gives the projection
the corresponding native element type. Complex selectors safely fall back to
`Element`, as native selector APIs do.

| Binding | Projection result | DOM effect |
| --- | --- | --- |
| `repeat(selector, project, bindings?)` or `repeat(selector, project, key, bindings?)` | array or nullish | Repeats the matched template element once per item; an optional key preserves item identity, and optional built-in DOM bindings are scoped to each occurrence |
| `text(selector, project)` | text value or nullish | Assigns `textContent`, or preserves it for nullish and invalid values |
| `prop(selector, name, project)` | any non-nullish value, TrustedHTML for `innerHTML`/`outerHTML`, or nullish | Assigns the native property with `Reflect.set`, or does nothing for nullish |
| `attr(selector, name, project)` | string, number, boolean, or nullish | Removes on `false`, creates an empty attribute on `true`, sets text, or does nothing for nullish |
| `classToggle(selector, name, project)` | boolean or nullish | Toggles only the named class, or does nothing for nullish |
| `style(selector, name, project)` | string or nullish | Sets one inline property, removes it for an empty string, or does nothing for nullish |

Every render projection receives the same context object: `data`, `item`,
`index`, `path`, and `parent`; `el` remains its second argument. `repeat` is
the only binding that interprets an array structurally. `undefined` and `null`
perform no DOM operation and leave the corresponding state unchanged. Invalid
`repeat`, `text`, `attr`, `classToggle`, and `style` results also perform no
operation. The development version gives one warning for each mounted
declaration and received value category. TrustedHTML property validation
remains a preparation-time error.

ARIA states, such as `aria-expanded` and `aria-pressed`, use string tokens.
`attr` uses the same boolean rules for `aria-*` names as for other names. Thus
`true` writes an empty attribute, and an empty value is not a valid ARIA state.
Project the string `'true'` or `'false'`, for example `String(open)`. Project
`false` only to remove the attribute. The development version writes one warning
for each mounted `aria-*` declaration that projects `true`. In TypeScript, a
literal `aria-*` name does not accept a projection that can return `true`.

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
  'innerHTML',
  ({data}) => markupPolicy.createHTML(data.markup),
)
```

Replacing the mounted component root itself through `outerHTML` is still
rejected because it would invalidate the mounted component boundary.

URL-valued properties and attributes such as `href`, `src`, and `action` remain
ordinary strings. Safe sanitization requires knowledge of the application's
trust and resource context. Applications must validate untrusted URLs before
including them in a render snapshot.

Every scalar projection receives the context and an element. Applications
can inspect the element to inject their own metadata conventions; HTML
attribute interpretation is not built in.

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

The default routes matching events through managed listeners on the
component root. One managed listener keeps covering matching elements created,
repeated, or moved by later updates, and no listener has to be reconnected
when repeated elements change.

Lumi reads the event's composed path, restricts it to DOM the component owns,
excludes the contents of shadow roots and DOM owned internally by nested Lumi
components, and invokes each matching binding once with the closest matching
path element. The mounted
component root participates in matching.

Compatible declarations share one logical router. The grouping key is the
event type, `capture`, and `passive`; `once` is binding state rather than part
of the key.

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

`event.currentTarget` is the component root and is never rewritten, because
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
rewritten as `focusin`. In the development version, a component declaration for a
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

Selectors are scoped to the component's current DOM and include the component
root. They stop at each shadow root, as scalar bindings do.

A composed event from a shadow tree reaches the component root. The browser
sets the shadow host as the target of that event. A component binding can
match the host or an ancestor of the host. It cannot match an element in the
shadow root. An event that is not composed stays in its shadow tree and does
not reach the component.

To handle events in a shadow root that you own, mount a component in that
shadow root.

Parent selectors do not match inside a child component's owned subtree; the
child mount container itself remains available to the parent. Unmount
disconnects every router, removes every element listener, and releases the
handler, element, and once state. A handler may unmount its own component,
after which the remaining bindings of that component are not invoked.

A routed handler that throws is reported with `reportError()` of the window
rather than aborting the other bindings sharing its router. Element
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

For a local reading order, `repeat` can take its built-in DOM bindings as the
last argument. Without a key projection, this is the third argument. These
bindings resolve their selectors only inside the repeated template element.
Their projections receive that occurrence's context. The repeated element
participates in matching, so `:scope` selects that element itself:

```js
repeat('.item', ({data}) => data.items, [
  text('.name', ({item}) => item.name),
])
```

`on` remains a component-level declaration. A repeat binding list accepts
`repeat`, `child`, `text`, `prop`, `attr`, `classToggle`, and `style`; all of
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

By default, Lumi reconciles repeated elements by array position. Reordering
changes the data represented by existing positions. Existing positions retain
their native DOM nodes. Appends create trailing nodes, and truncation removes
trailing nodes.

An explicit key projection keeps an occurrence with an application item when
its position changes:

```js
repeat(
  '.item',
  ({data}) => data.items,
  ({item}) => item.id,
  [text('.name', ({item}) => item.name)],
)
```

When the key order changes, Lumi moves the fewest possible elements: the
largest group of elements already in the new order does not move. Lumi moves
an element with `moveBefore()`. Refer to
[Browser requirements](#browser-requirements) for a browser that does not
have it.

The key projection receives the new occurrence context. It does not receive
an element because Lumi must compute the key before it selects an existing
element. Lumi compares keys with the same equality rules as a JavaScript
`Map`.

Two items can have the same key. Each item then gets its own element. When
the list changes, the first item that has the key keeps the element of that
key, and each other item with the key gets a new element. Use unique keys
when each element must stay with its item.

Lumi stores keys in internal occurrence state. It does not add key attributes
to the DOM. An application can use `attr` if it must expose an item identifier
in markup. Lumi does not infer keys from `key` or `id` properties, or from
object identity.

Array cardinality cannot replace the mounted component root, whose public
boundary is one persistent `Element`. It applies to descendants of that root.
The repeatable target must exist in the component source to provide a
pristine element to clone. Projection and coordinate validation complete
before the live DOM changes.

A new repeated element is a copy of the source element. When the bindings of
the repeat are `text`, `attr`, and `classToggle` bindings, Lumi can give the
values to one inert element and copy that element. The new element then has
its text, attributes, and classes before it goes into the document, and it
is equal to a copy of the source that got the same values. A custom element
in such a copy has its attributes when its constructor runs.

### Conditional regions

A region that is in the DOM only for some data is a `repeat` with zero or one
item. An empty array removes the element. An array with one item puts the
element back at the same location:

```js
repeat('#profile', ({data}) => data.selected ? [data.selected] : [], [
  text('.name', ({item}) => item.name),
  attr('.email', 'href', ({item}) => `mailto:${item.email}`),
])
```

The projections in the binding list run only when the item is there. They
need no value for the state without an item.

The element stays the same element while the array has one item, and its
bindings get the new values. With a key projection, a different key gives a
new element. A nullish result keeps the region as it is.

A removed element loses its browser state, for example the text in a form
control. To hide an element and keep its state, bind the `hidden` property:

```js
prop('#directory', 'hidden', ({data}) => data.selected !== undefined)
```

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
non-text text result is a recoverable no-op: Lumi preserves the existing DOM.
The development version gives one warning per mounted declaration and
received value category.

A `repeat` selector that matches no element in the component source repeats
nothing. Its projections do not run. The development version gives a
warning.

## Injecting an application binding convention

The smallest convention can map application-owned metadata directly to
presentation object properties:

```js
import {text} from '@thlibjs/lumi'

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
import {repeat, text} from '@thlibjs/lumi'
import {jsonPath} from './examples/data-path.js'

function bindDataPaths() {
  return [
    repeat('[data-repeat]', ({item}, el) => {
      return jsonPath(item, el.dataset.repeat)
    }),
    text('[data-text]', ({item}, el) => {
      return jsonPath(item, el.dataset.text)[0]
    }),
  ]
}

const definition = component({
  source: template,
  bindings: [
    ...bindDataPaths(),
  ],
})
```

The path behavior belongs to JSONPath, not Lumi. The adapter caches parsed
queries and preserves JSONPath's nodelist cardinality. `repeat` consumes the
whole nodelist while `text` takes the first result. Paths are evaluated
against the current item, which is the component data outside a repeated
region. Another application may use direct projections, external binding
maps, another metadata convention, or no helper at all.

These factories compose Lumi's public functions; they do not add a second
component or rendering lifecycle. Lumi does not reserve their attributes,
inspect their path strings, or require applications to use such a convention.

## `child(selector, component, project)`

`child` puts one nested component into each selected container. The
projection receives the context and gives the data of the child:

```js
child('.profile-slot', profileComponent, ({data}) => data.profile)
```

The child replaces the content of the container. The root of the child stays
the same element for all updates of the parent. A child at the component
boundary is in the DOM from the mount of the parent.

In the child, `data` is the value that the projection gave. A nullish
projection keeps the child as it is.

In the binding list of a `repeat`, each occurrence gets its own child, and
the projection receives the context of that occurrence:

```js
repeat('.member-row', ({data}) => data.members, ({item}) => item.id, [
  child('.card-slot', memberCard, ({item}) => item),
])
```

The repeated element itself can be the container: use the selector `:scope`.
A child outside the list gets its context from the position of its
container, as other bindings do. A [conditional region](#conditional-regions)
can contain a child.

A child is a part of the update of its parent. All projections of the parent
and of its children run before a change to the live DOM, so an error in a
projection of a child leaves the DOM as it was.

Lumi compiles a child component one time for each mounted parent. Each
container gets a copy of the source of the child, so a child in a large list
does not resolve its selectors again.

The event bindings of the child are on the root of that child. The selectors
of the parent do not match an element in the child, and the selectors of the
child match only its own elements.

A selector that matches no element puts in no child. The development version
gives a warning.

## DOM ownership

A binding writes only the DOM sink named by that binding:

- A `repeat` declaration owns element cardinality and occurrence identity.
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

Markup writes are the exception to ordinary declaration ordering: a markup
write is prepared and committed before the other rules, and an ancestor
before a descendant. Markup writes at the same element retain declaration
order. The selectors then resolve for the elements that the markup created.

Parent rules do not select inside a subtree owned by `child`.
Writing content on that container or one of its ancestors would detach a live
nested component, so the mount is rejected.

Unbound state remains under browser or application ownership. Imperative code
should not write a property or subtree already owned by a binding.

Lumi does not repair such a write to the state of a `text`, `attr`,
`classToggle`, or `style` binding. These bindings compare the projection
with the value that they wrote last, not with the live DOM. The foreign
state stays until the projection changes. A `prop` binding is different: it
compares with the live property on each update.

## Types

Lumi ships TypeScript declarations. Give the data type to the component
options. A binding at the component boundary then gets the type of `data`
from the options:

```ts
import {
  component,
  repeat,
  text,
  type ComponentOptions,
} from '@thlibjs/lumi'

type Member = {id: string, name: string}
type Team = {title: string, members: Member[]}

const options: ComponentOptions<Team> = {
  source: document.querySelector('template'),
  bindings: [
    // data is Team.
    text('h1', ({data}) => data.title),
    repeat<Member, Team>('li', ({data}) => data.members, ({item}) => item.id, [
      // item is Member, and data is Team.
      text('.name', ({item}) => item.name),
    ]),
  ],
}

const team = component(options).mount(document.querySelector('#team'))

team.update({title: 'Design', members: [{id: 'ada', name: 'Ada'}]})
```

A `repeat` needs two type arguments: the item type and the data type.
TypeScript examines the binding list before the projection of the `repeat`,
so the list cannot get the item type from that projection. The bindings in
the list then need no type argument. A `repeat` in the list of a different
`repeat` has a third type argument, the item type of its parent:
`repeat<Tag, Team, Member>(…)`.

Some bindings are not in a position that has a type. Examples are a binding
in a variable, a binding that a function such as `map` returns, and a
binding outside the list of its `repeat`. Give such a binding its type
arguments, or give a type to the context parameter:

```ts
import type {ProjectionContext} from '@thlibjs/lumi'

text<Member>('li .name', ({item}) => item.name)
text('li .name', ({item}: ProjectionContext<Member, Team>) => item.name)
```

`Binding<Data, Item>` is the type of a binding. `Item` is the type of
`context.item` in its projection. `Binding<Data>` accepts each item type,
and the `bindings` option of a component has this type.

## Selector check

A selector that matches no element is a no-op, so a selector with a typing
mistake gives no error. Each selector resolves one time, in the component
source. Thus a test can find such a selector without data and without a
mount.

`unmatchedSelectors(component)` gives the bindings of a component whose
selector matches no element in the component source, in the order of their
declaration. The argument is a component from `component()`, or its options:

```js
import assert from 'node:assert/strict'
import {unmatchedSelectors} from '@thlibjs/lumi/check.js'
import {counter} from './counter.js'

assert.deepEqual(unmatchedSelectors(counter), [])
```

Each entry has the name of the binding function and the selector:

```js
[{binding: 'text', selector: 'ouput span'}]
```

The result of each selector is the result that a mount gets. A binding in
the list of a `repeat` matches only in the element of that repeat, and no
binding matches in the container of a child component. The function examines
one component. Examine a child component with a second call.

A markup binding (`innerHTML` or `outerHTML`) can create an element in an
update. A selector for such an element is in the list, because the source
does not have the element. Compare the list with the entries that you
expect.

The function needs a DOM. In Node.js, make the component source in a DOM
library, for example jsdom.

## Development and production versions

Lumi has two versions with the same API and the same DOM results.

| Version | File | Contents |
| --- | --- | --- |
| Development | `dist/lumi.dev.js`, and the package source | All checks, all warnings, and a sentence for each error |
| Production | `dist/lumi.js` | The checks that prevent an incorrect DOM, and a code for each error |

Select a version as follows:

- With a bundler, `import '@thlibjs/lumi'` gives the development version. A
  bundler that sets the `production` export condition gets the production
  version. Vite and webpack set this condition for a production build. For
  esbuild, use `--conditions=production`.
- Without a build step, load `dist/lumi.dev.js` during development and
  `dist/lumi.js` in production.

Use the development version while you write an application. It finds
mistakes that the production version does not report.

### Warnings

Only the development version gives warnings. Each warning starts with
`Lumi:` and goes to `console.warn`. The DOM result is the same in the two
versions.

| Situation | Result in the two versions |
| --- | --- |
| A projection gives a value that the binding cannot write | The DOM state stays |
| An `aria-*` attribute gets the value `true` | An empty attribute |
| A `repeat` or `child` selector matches no element | The binding does nothing |
| The third argument of `repeat` is not a key projection or a list | The argument has no effect |
| A component source has more than one root element | The component uses the first one |
| An `on` declaration has a part that is not valid | An option that is not valid gets its default value |
| A component event type usually does not bubble | The listener stays on the component |
| A projection gives an error | The error goes to the caller |

### Errors

Lumi gives an error only when it cannot make a correct DOM. In the
development version, the message has the code and a sentence:

```text
Lumi E5: repeat ".row" matches the component root. A repeat must match a descendant.
```

In the production version, the message has the code and the details:

```text
Lumi E5 .row
```

These errors are in the two versions:

| Code | Cause | Details |
| --- | --- | --- |
| `E1` | An `attr` or `prop` binding names an event handler, for example `onclick`. Use `on`. | Binding kind, name |
| `E2` | An `attr` or `prop` binding names `srcdoc`. | Binding kind, name |
| `E3` | An `innerHTML` or `outerHTML` projection gave a value, but the document has no Trusted Types API. | Property name |
| `E4` | An `innerHTML` or `outerHTML` projection gave a value that is not genuine `TrustedHTML`. | Property name |
| `E5` | A `repeat` selector matches the component root. | Selector |
| `E7` | A binding in the list of a `repeat` matches an element outside that repeat. | Selector |
| `E8` | A binding in the list of a `repeat` matches an element in a different repeat. | Selector |
| `E9` | A `text`, `innerHTML`, or `outerHTML` binding contains the container of a child component. | Selector |
| `E10` | An `outerHTML` binding matches the component root. | Selector |
| `E11` | A `text`, `innerHTML`, or `outerHTML` binding contains the element of a `repeat`. | Selector |
| `E12` | An `outerHTML` binding matches an element that markup created. The element must be in the component source. | Selector |
| `E13` | An update or an unmount started while the component was in an update. | None |

`E1` and `E2` occur when the application makes the binding. `E3`, `E4`, and
`E12` occur in the preparation of an update, before a change to the live
DOM. `E5` and `E7` to `E11` occur in `mount`, and the target keeps its
content. The code `E6` is not in use.

These errors are only in the development version. In each of these
situations, the production version gives the error of the browser:

| Code | Cause |
| --- | --- |
| `E20` | The mount target is not an element or a document fragment. |
| `E21` | The component source is not a `<template>`, a document fragment, or an element. |
| `E22` | The component source has no root element. |
| `E23` | The list of a `repeat` contains a binding that is not a `repeat`, `child`, `text`, `attr`, `prop`, `classToggle`, or `style` binding. |
| `E24` | The component of a `child` binding does not come from `component()`. |

### Errors that are not from Lumi

- If application projection code throws, the caller of `update` gets that
  error, not a different error. The live DOM stays as it was. The development
  version also gives a warning that identifies the binding, the selector, and
  the one-based matched position.
- A selector that is not valid gives the `DOMException` of the browser. An
  event selector is examined when the component connects, even when it
  matches no element, so an invalid declaration fails the mount.
- A DOM property that cannot be assigned gives the error of the browser.

### Changes that other code makes to the DOM

Other code can remove or move an element that Lumi owns. Lumi gives no error
for such a change:

- A binding target that is not at its position gets no update.
- A repeated list whose position marker was removed gets no update.
- Repeated elements that other code moved go back to the order of the data.

## Browser requirements

Lumi targets current browsers with native support for ES modules,
`<template>`, Shadow DOM, selectors, `importNode`, `classList`,
`addEventListener`, `Map`, `Set`, `reportError()`, and `moveBefore()`.

Lumi calls browser APIs directly. It has no fallback code for a browser that
does not have an API. For such a browser, the application loads a shim before
the first update.

| API | Lumi uses it to | Shim |
| --- | --- | --- |
| `moveBefore()` | Move a repeated element to a new position | `@thlibjs/lumi/shims/move-before.js` |

Load a shim only when the browser needs it:

```js
if (!('moveBefore' in Element.prototype)) {
  await import('@thlibjs/lumi/shims/move-before.js')
}
```

Without a build step, import `src/shims/move-before.js` from the CDN, from the
same package version as the bundle.

At the time of this release, Safari does not have `moveBefore()`. Lumi moves
an element when the order of the keys in a keyed repeat changes, and when
other code changed the order of repeated elements. Without the shim, such an
update throws a `TypeError` in a browser that does not have `moveBefore()`.

The shim moves the element with `insertBefore()`. The browser then resets the
state that `moveBefore()` keeps, for example focus, a loaded iframe, and a CSS
animation.
