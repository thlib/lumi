# Repeated occurrences

Lumi treats a DOM position as a sequence of occurrences. `repeat` is the only
binding that changes that sequence; `text` projects a scalar into each existing
occurrence.

```js
repeat('.person', ({data}) => data.people)
text('.person .name', ({item}) => item.name)
```

An optional binding list creates a local selector scope inside each repeated
`.person` occurrence:

```js
repeat('.person', ({data}) => data.people, [
  text('.name', ({item}) => item.name),
])
```

This differs from a flat declaration: a nested `.name` cannot match a
similarly named element elsewhere in the component. Flat bindings remain
structural—the matched DOM position supplies their occurrence context.
Within a repeat binding list, `:scope` selects the repeated element itself.

For `{people: [{name: 'Ann'}, {name: 'Bo'}]}`, Lumi keeps two `.person`
occurrences. Their text projections receive `Ann` and `Bo` as `item`, while
both retain the complete presentation snapshot as `data`.

## Identity

By default, each occurrence keeps its DOM identity by array position. Give
`repeat` a key projection when DOM identity must follow an item:

```js
repeat(
  '.person',
  ({data}) => data.people,
  ({item}) => item.id,
  [text('.name', ({item}) => item.name)],
)
```

The key projection is before the optional binding list. Lumi stores each key
in internal state. It does not write the key to the DOM. When the array order
changes, Lumi moves the existing keyed element and its occurrence state.

The key projection receives the occurrence context but does not receive an
element. Each key must be unique in its immediate repeat region. A duplicate
key rejects the complete update before Lumi changes the live DOM.

## Context

Every `repeat` and `text` projection receives:

```js
{
  data,   // the component's complete presentation snapshot
  item,   // this occurrence's value
  index,  // its index within its immediate repeat
  path,   // every nested repeat index, for example [1, 2]
  parent, // the enclosing occurrence context, or null at the root
}
```

At a component root, `item === data`, `index === 0`, `path` is `[]`, and
`parent` is `null`.

## Nested arrays

Arrays do not implicitly change DOM shape. A nested `repeat` consumes a nested
array when the application chooses it:

```js
repeat('.group', ({data}) => data.groups)
repeat('.person', ({item: group}) => group.people)
text('.person .name', ({item: person}) => person.name)
```

This keeps a flat declaration list while preserving the same positional model:
each `.person` has a path such as `[groupIndex, personIndex]`.

## Other bindings in a repeated region

`prop`, `attr`, `style`, and `classToggle` receive that same occurrence
context:

```js
repeat('.person', ({data}) => data.people)
attr('.person', 'aria-label', ({item}) => item.name)
```

`repeat` owns cardinality; scalar bindings write one value for the current
occurrence.

## Invalid runtime values

A nullish or non-array `repeat` result, and invalid `text`, `attr`,
`classToggle`, or `style` results, leave the current DOM untouched. In
development Lumi emits one warning per mounted declaration and received value
category. This makes malformed runtime data recoverable rather than turning it
into a render-time exception.

For the complete contract, see [API.md](../API.md#repeated-occurrences).
