# How array cardinality works

A walkthrough of what happens when a `bind` projection returns an array.
[API.md](../API.md#array-valued-bind-projections) is the normative contract;
this document explains the mechanism behind it.

Line references point at [`src/cardinality.js`](../src/cardinality.js).

## The one-sentence version

Repeated elements are numbered, projections always see the whole data and
return whole parallel arrays, and Lumi reduces each returned value by the
occurrence's number with non-arrays broadcasting unchanged.

## When I bind a list to `<ul>` and repeat the `<li>`, what does the `<li>` receive?

The same thing every other binding receives: the whole top-level object you
passed to `update()`.

Lumi never slices, wraps, or re-scopes your data. There is no per-item
argument, no implicit `item` or `$index`, no child context object.

What differs between one repeated element and the next is a **coordinate** — a
list of integers — and Lumi applies that coordinate to the value your
projection **returned**, not to the value it received.

Scoping happens on the output side.

## The smallest complete example.

```js
const data = {people: [{name: 'Ann'}, {name: 'Bo'}]}
```

```html
<ul>
  <li class="item"><span class="name">default</span></li>
</ul>
```

```js
bind('.item', d => d.people)                    // → [{…}, {…}]
bind('.name', d => d.people.map(p => p.name))   // → ['Ann', 'Bo']
```

Result:

```html
<ul>
  <li class="item"><span class="name">Ann</span></li>
  <li class="item"><span class="name">Bo</span></li>
  <!--lumi-->
</ul>
```

## Trace it. What actually happens, in order?

**1. The region projects and produces a count.**

`.item` is a `bind`, so it defines a *region* — a template location whose
cardinality is owned by an array. It projects once and gets a 2-element array,
so the region needs two occurrences.

Occurrence 0 is the original template `<li>`. Occurrence 1 is a fresh clone of
that same pristine template element ([:1300](../src/cardinality.js#L1300)),
which is why the clone arrives with its own `<span class="name">` inside.

Each occurrence is stamped with a coordinate ([:501](../src/cardinality.js#L501)):

```
li #0  →  [0]
li #1  →  [1]
```

**2. The descendant projects with the full data, again.**

For occurrence 0, Lumi calls the `.name` projection:

```
project(data, blueprintSpan)  →  ['Ann', 'Bo']
```

It received the entire `data` object and returned the entire two-element
array. It has not been narrowed to `'Ann'` in any way.

**3. The coordinate indexes the result.**

```
['Ann', 'Bo']  indexed by [0]  →  'Ann'
['Ann', 'Bo']  indexed by [1]  →  'Bo'
```

Same function, same input, different coordinate, different output. That
indexing step is the whole mechanism.

## What is the indexing rule exactly?

Two cases, walked one coordinate level at a time
([`resolveCoordinate`, :575](../src/cardinality.js#L575)):

```
value IS an array      →  consume one coordinate level, continue
value is NOT an array  →  stop; hand this value to every occurrence below
```

The second line is the one worth remembering. A scalar automatically
**broadcasts**.

```js
bind('.name', d => 'Hello')
```

Both `<li>`s show `Hello`. Coordinate `[0]` hits a non-array and returns it
unchanged. You never have to write `['Hello', 'Hello']` to fill a repeated
region with a constant.

## How does the `<span>` know it belongs to the `<li>`?

From the template, not from the data.

At compile time Lumi walks your bindings once and asks, for each selector
target, *which bind-region element contains it in the HTML?*
([`nearestRegion`, :308](../src/cardinality.js#L308)). Because `.name` sits
inside `.item` in the markup, it is filed as a child of that region.

It is then stored as an **index path** relative to the region element
([:280](../src/cardinality.js#L280)) — "child 0" — not as a selector.

At runtime each cloned `<li>` re-walks that fixed path inside its own subtree
([:1228](../src/cardinality.js#L1228)). It never queries the document. That is
why repeating the `<li>` does not re-run the whole list: containment was
decided once, statically, and each occurrence only touches offsets it owns.

## So the `<li>` doesn't "repeat everything", why?

Because the region owns a bounded piece of the template and nothing above it.

The `<ul>` is not a region; it is untouched. The `<li>` is the region target,
so it is the unit that repeats. Everything *inside* the `<li>` is a nested
scope, re-resolved per clone. Everything *outside* is planned once, at
coordinate `[]`.

A comment node (`<!--lumi-->`) is parked after the region as a range anchor
([:1284](../src/cardinality.js#L1284)) so later updates know exactly where to
insert additional occurrences.

## A common mistake.

Expecting the child projection to be scoped, the way `items.map(p => <Li
person={p}/>)` scopes in React:

```js
bind('.name', person => person.name)   // ✗
```

This receives `data`, which is `{people: [...]}`. `data.name` is `undefined`,
Lumi treats nullish as a no-op, and the span silently keeps its `default`
text. Nothing throws.

The correct form always reaches through the full data and returns a value
whose **shape parallels the region's shape**:

```js
bind('.name', d => d.people.map(p => p.name))   // ✓
```

That is the mental flip: you are not building a scoped child, you are
supplying a parallel array that the coordinate will index.

## Can I tell which occurrence I'm in from inside a projection?

No, and this is deliberate.

The projection signature is `(data, element)`. During cardinality planning,
`element` is `spec.target` — the *blueprint* element from the compiled
template ([:436](../src/cardinality.js#L436)) — not the live clone. Both
arguments are occurrence-independent.

Shape is the only channel through which per-occurrence variation can travel.

## How does nesting work?

Coordinates just get longer.

```js
bind('.group', d => d.groups)                              // coordinate [i]
bind('.name',  d => d.groups.map(g => g.map(p => p.name))) // coordinate [i, j]
```

```html
<section class="group">
  <span class="name">default</span>
</section>
```

An occurrence at `[1, 2]` indexes twice: `result[1][2]`.

Ragged nesting is valid — inner arrays may have different lengths. An empty
inner array removes only the elements at that inner level, leaving its parent
occurrence in place.

And broadcasting still applies at any depth: a `.name` projection returning a
flat array of group labels would consume `[1]` and then stop, giving every
person in group 1 the same label.

## What if my nested array is too short?

You get a `RangeError`, not a blank element:

```
Lumi bind projection for ".name" does not contain array coordinate [1, 2]
```

Raised by [`missingCoordinate`, :597](../src/cardinality.js#L597).

Crucially, this happens during **planning**, before any DOM mutation. The
whole plan — every projection, every coordinate lookup — completes first, and
only then does `commit()` touch the document. You never get a half-updated
list.

## What happens when the array changes length?

Reconciliation is strictly positional
([`RegionState.apply`, :1290](../src/cardinality.js#L1290)):

| Change | Effect |
| --- | --- |
| Append | New clones inserted before the anchor |
| Truncate | Trailing occurrences popped and removed |
| Reorder | **Nothing moves.** Existing nodes stay put and display new data |

That last row is the public contract, not an implementation gap. Lumi does not
read `key` or `id`, does not compare object identity, and accepts no key
function. Position *is* identity.

The consequence to plan around: if you reorder your array, the DOM node that
held item A now holds item B — along with its focus, scroll position, `<input>`
value, and any node-attached browser state.

## Why does a nullish projection do nothing instead of clearing the list?

Nullish is defined as a no-op that preserves the current region
([:474](../src/cardinality.js#L474)), so a projection that has nothing to say
about a location leaves it alone, treating `undefined` and `null` as errors elsewhere.

To clear a region, return `[]`. That is an array of length zero, which means
zero occurrences.

Note: nullish *entries inside* an array are invalid, because
each entry must define one occurrence.

## What can an array entry be?

- **Text values** (`string`, `number`, `boolean`) become the occurrence's
  `textContent` ([:509](../src/cardinality.js#L509)).
- **Objects and nested arrays** establish structural context: the element's
  descendants are preserved so nested bindings can fill them.
- **`null`, `undefined`, or other primitives** throw a `TypeError`.

Arrays must also be dense — a hole (`[1, , 3]`) throws
([:489](../src/cardinality.js#L489)).

## Are there places cardinality can't apply?

Two, both structural:

1. **Not at the mounted component root** ([:483](../src/cardinality.js#L483)).
   A component's public boundary is one persistent `Element`; cardinality
   applies to its descendants.
2. **Not at a location whose content another binding owns**
   ([:366](../src/cardinality.js#L366)). If an `innerHTML` binding owns a
   subtree containing a region, that overlap throws — two declarations cannot
   both own the same content.

The repeatable target must also exist in the template, since that is the
pristine element Lumi clones.

## What does the terminology mean?

- **Positional cardinality** — count comes from array `length`, identity comes
  from array index. Nothing else is consulted.
- **Coordinate** — the path of indices from the root through each enclosing
  region: `[]`, `[1]`, `[1, 2]`.
- **Broadcast** — the non-array branch of `resolveCoordinate`; one value
  serving every occupant below it.
- **Region** — a template location whose element count is owned by a `bind`
  projection.
- **Occurrence** — one repeated element within a region, holding one
  coordinate.

