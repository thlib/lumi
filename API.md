# Lumi API

Lumi is implemented as browser-native ES modules with no runtime dependencies.
The source is plain JavaScript.

The API is experimental and may change while the design is validated.

## Quick start

```js
import {
  mount,
  property,
  text,
} from '@thlib/lumi'
import { on } from './plain.js'

let data = { count: 0, maximum: 5 }
const slot = document.querySelector('#counter-slot')

const counter = mount(data, {
  target: slot,
  template: document.querySelector('template'),
  bindings: [
    text('[data-counter-value]', data => data.count),
    property(
      '[data-counter-increment]',
      'disabled',
      data => data.count >= data.maximum,
    ),
  ],
})

on(slot, 'click', '[data-counter-increment]', () => {
  data = { ...data, count: data.count + 1 }
  counter.render(data)
})
```

The first argument supplies the initial data and its inferred shape. The
options identify native DOM and declare only data-to-DOM projections. Events
and state transitions remain ordinary application JavaScript.

`data-counter-value` and `data-counter-increment` are application-owned hooks.
Lumi does not inspect their names or values. Classes, IDs, or any other valid
CSS selector work equally well.

The example-local `on` helper is a small wrapper around native event bubbling,
`closest()`, and `addEventListener()`. It is not part of Lumi.

## `mount(data, options)`

`mount` clones the template into the target, connects its bindings, renders
the initial data, and returns a mounted component. It is the concise form for
one component instance.

The target and template may be direct `querySelector` results. Lumi throws a
clear error if either is missing or the template does not contain exactly one
root element. If connecting or initially rendering fails, it removes the
partially mounted root.

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

`mount` deep-clones the template with `cloneNode(true)`, appends its single
root element to `target`, resolves the bindings, and returns a mounted
component.

### `definition.adopt(root)`

`adopt` attaches bindings to an existing root element without cloning or
replacing it. It is the initial primitive for progressively enhanced or
server-rendered DOM.

### `mounted.render(data)`

`render` evaluates every projection against the supplied snapshot. A binding
compares its projected value with the corresponding DOM state and writes only
when the value differs. Bindings cache values where the browser cannot change
the owned state independently.

Property bindings also compare against the live property on every render.
This lets authoritative data restore a user-mutated `value`, `checked`, or
similar browser state. Lumi remembers the browser's post-assignment value so
native coercion does not cause a repeated write.

Rendering is synchronous and explicit. Lumi does not retain subscriptions to
the data object.

### `mounted.unmount()`

`unmount` destroys connected bindings, unmounts owned child components, and
removes the component root. Repeated calls have no effect. Rendering after
unmount throws.

## Scalar bindings

Each scalar binding resolves its selector once when the component connects.
The component root itself participates in selector matching.

| Binding | Projection result | DOM effect |
| --- | --- | --- |
| `text(selector, project)` | string, number, or boolean | Assigns `textContent` |
| `property(selector, name, project)` | the projection's inferred type | Assigns the native property with `Reflect.set` |
| `attribute(selector, name, project)` | string, number, or boolean | Removes on `false`, creates an empty attribute on `true`, otherwise sets text |
| `classToggle(selector, name, project)` | boolean | Toggles only the named class |
| `style(selector, name, project)` | string | Sets one inline property, or removes it for an empty string |

Bindings do not replace an element's complete class or style attribute. This
allows HTML, CSS, other bindings, and explicitly separate code to own other
parts of the same element.

Generic property and attribute bindings reject native event handler names such
as `onclick`. Attach behavior with the browser's `addEventListener()`. Generic
bindings also reject `innerHTML`, `outerHTML`, and `srcdoc` where applicable.
Trusted HTML requires a separate explicit API and is not implemented.

URL-valued properties and attributes such as `href`, `src`, and `action` remain
ordinary strings. Lumi does not claim to sanitize them without knowing the
application's trust and resource context. Applications must validate untrusted
URLs before including them in a render snapshot.

## `child(selector, component, project)`

`child` mounts one nested component into the selected container. The
projection selects the child's data from the parent snapshot:

```js
child('.profile-slot', profileComponent, page => page.profile)
```

The child root is mounted once and persists across parent renders. The
container must not initially contain another element.

## `repeat(selector, options)`

`repeat` reconciles an array with keyed child components:

```js
repeat('.results', {
  items: page => page.results,
  key: result => result.id,
  component: resultComponent,
})
```

Keys must be unique strings or finite numbers within one render. Existing
keys retain their component roots and receive new item data. Removed keys are
unmounted. Reordered keys move the existing roots instead of recreating them.
Lumi keeps the longest already-ordered subsequence in place, which minimizes
physical DOM moves. Browsers with native `moveBefore()` use its
state-preserving move semantics. Other browsers fall back to `insertBefore()`.

The selected container is owned by the repeat binding and must not initially
contain another element. Adoption of server-rendered repeated children is not
implemented yet.

## Custom bindings

`Binding<Data>` is a public structural contract for DOM behavior that does not
fit the built-in projections. A custom binding resolves its elements in
`connect`, applies data in `render`, and releases native resources in
`destroy`:

```js
/** @type {import('@thlib/lumi').Binding<{ isFocused: boolean }>} */
const focus = {
  connect(root) {
    const input = root.querySelector('input')

    if (!(input instanceof HTMLInputElement)) {
      throw new TypeError('Expected the component to contain an input')
    }

    return {
      render(data) {
        if (data.isFocused && document.activeElement !== input) {
          input.focus()
        }
      },
      destroy() {},
    }
  },
}
```

Custom bindings follow the same single-writer rule as built-in bindings. They
are the plain JavaScript extension point, not a second component model or an
embedded template language.

## DOM ownership

A binding writes only the DOM state named by that binding:

- A text binding owns `textContent`.
- A property binding owns one property.
- A class binding owns one class token.
- A style binding owns one style property.
- A child or repeat binding owns the element children of its container.

Unbound state remains under browser or application ownership. Lumi and
imperative code should not write the same property or subtree.

## Errors

Lumi throws when:

- A template has zero or multiple root elements.
- A selector does not match within the component root.
- A child or repeat container already contains an element.
- Repeated data contains an invalid or duplicate key.
- A render is recursive or targets an unmounted component.
- A DOM property cannot be assigned.
- A generic binding targets an event handler or trusted-content sink.

Selector syntax errors remain native `DOMException`s from the browser.

## Browser requirements

The current implementation targets modern browsers with native support for ES
modules, `<template>`, `querySelector`, `cloneNode`, `classList`,
`addEventListener`, `Map`, `Set`, and `Reflect`.

Native `moveBefore()` is used when available and is not required. Compatibility
shims are not included in the first implementation. They can be added below
the public API without changing component definitions.
