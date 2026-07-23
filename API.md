# Lumi API

Lumi is implemented as browser-native ES modules with no runtime dependencies.
The source is plain JavaScript.

The API is experimental and may change while the design is validated.

## Component definition

A component definition declares the shape of data accepted by `render`:

```js
import {
  component,
  on,
  property,
  text,
} from '@thlib/lumi'

/** @typedef {{ count: number, maximum: number }} CounterData */

const template = document.querySelector('#counter-template')

if (!(template instanceof HTMLTemplateElement)) {
  throw new TypeError('Expected #counter-template to be a template')
}

/** @type {import('@thlib/lumi').ComponentOptions<CounterData>} */
const options = {
  template,
  bindings: [
    text('.counter-value', data => data.count),
    property(
      '.counter-increment',
      'disabled',
      data => data.count >= data.maximum,
    ),
  ],
  events: [
    on('.counter-increment', 'click', ({ data, event }) => {
      console.log(data.count, event.type)
    }),
  ],
}

const counter = component(options)
const target = document.querySelector('#counter-slot')

if (target === null) {
  throw new Error('Expected #counter-slot to exist')
}

const mounted = counter.mount(target)
mounted.render({ count: 0, maximum: 5 })
```

## `component(options)`

`component` creates a reusable definition. It does not clone or modify the
template until an instance is mounted.

The template must contain exactly one root element. That root is the component
boundary used for scoped selectors and native event dispatch.

```js
const definition = component({
  template,
  bindings: [],
  events: [],
})
```

Both arrays are optional. They are separated for readability and share the
same binding lifecycle internally.

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

`unmount` removes native listeners, unmounts owned child components, and
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
as `onclick`. Use `on()` so the listener remains a native function with an
explicit lifecycle. They also reject `innerHTML`, `outerHTML`, and `srcdoc`
where applicable. Trusted HTML requires a separate explicit API and is not
implemented.

URL-valued properties and attributes such as `href`, `src`, and `action` remain
ordinary strings. Lumi does not claim to sanitize them without knowing the
application's trust and resource context. Applications must validate untrusted
URLs before including them in a render snapshot.

## `on(selector, type, handle, options)`

`on` installs one native `addEventListener` callback during the first render.
The same function remains installed until unmount and receives the latest
successfully rendered data.

```js
on('form', 'submit', ({ data, element, event, root }) => {
  event.preventDefault()

  root.dispatchEvent(new CustomEvent('profile:save-requested', {
    bubbles: true,
    composed: true,
    detail: { id: data.id },
  }))
})
```

`event`, `element`, and `root` are native DOM objects. Capture, bubbling,
cancellation, passive listeners, and default actions retain their browser
semantics. Events dispatched before the first render have no Lumi listener
because no data snapshot exists yet.

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
