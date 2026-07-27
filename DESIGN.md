# Lumi design

Lumi is a small browser-first rendering layer.

Its one responsibility is declarative DOM rendering. Application code
describes what the DOM should show. Rendering finds, creates, moves, and
updates the necessary nodes.

```text
native HTML + ordinary JavaScript or TypeScript rules + a data snapshot
                                  |
                              update(data)
                                  |
                     minimal writes to the real DOM
```

Call `update(data)` to render a snapshot, then call it again when the snapshot
changes. Data fetching, change detection, and update timing remain application
concerns.

This is not a framework around the browser. It is the missing mechanical step
between plain data and persistent native DOM.

Declarative updates work with native HTML, without relocating that HTML into
JavaScript or imposing a state-management model.

## The problem it removes

Without a rendering layer, application logic gradually becomes DOM logic:

```js
const value = root.querySelector('.counter-value')
const button = root.querySelector('.counter-increment')

value.textContent = model.count
button.disabled = model.count >= model.maximum

button.addEventListener('click', () => {
  model.count += 1
  value.textContent = model.count
  button.disabled = model.count >= model.maximum
})
```

This works, but the application now owns several unrelated concerns:

- Which element displays each value.
- Which DOM property must change.
- When listeners are installed and removed.
- Which updates must be repeated after every state change.
- How nodes survive conditionals, positional list changes, and layout changes.

The difficult part is not assigning `textContent` once. It is preserving the
correct relationship between changing data and long-lived browser state as
the page grows.

Declarative JavaScript rules capture that relationship. Application
code remains responsible for data and decisions. The browser remains
responsible for the DOM and native behavior. Rendering provides the repetitive
translation between them.

## Native HTML as an extensible substrate

Let HTML describe the document. Let small, replaceable tools connect data or
behavior to it.

Rendering starts with HTML parsed by the browser, including native `<template>`
elements, rather than an HTML-shaped value embedded in another language. The
template owns semantic structure and may contain useful default content.
Ordinary attributes and `data-*` metadata give other tools stable places to
attach their own conventions.

That metadata has no built-in meaning. A tool may interpret a data path,
associate schema fields with controls, provide localization keys, or connect
native events to application behavior. It then expresses the resulting
data-to-DOM relationships as bindings. Another tool may use different metadata
or an external binding map while relying on the same rendering API.

The rendering substrate supports independently specified binding languages
without imposing one of its own.

That separation produces this architecture:

```text
browser primitives
    <template>, DOM, selectors, events, forms
                       |
Lumi renderer
    mounting, reconciliation, ownership, minimal writes
                       |
independent tools
    data paths, schemas, forms, localization, component conventions
                       |
application
    state, behavior, routing, scheduling
```

Each layer remains independently replaceable. DOM reconciliation can improve
without changing an injected binding language. A binding tool can evolve
without becoming rendering policy. Applications can combine tools where their
ownership does not conflict, and can use direct JavaScript projections where
no additional convention is useful.

## Why not React, Vue, or Angular?

The difference is not whether these tools can render efficiently. They can.
The difference is what an application adopts in order to get declarative
rendering.

Their common authoring and update models place more responsibility in a UI
runtime:

- React components return element descriptions, commonly written with JSX.
  State updates schedule component work, and React reconciles the resulting
  descriptions with the mounted UI.
- Vue commonly combines HTML-like templates with Vue expressions and
  directives. Its reactive runtime tracks state used by components and
  schedules the affected updates.
- Angular templates contain Angular bindings and directives. Angular's
  component runtime and change detection determine when those bindings are
  updated.

Those mechanisms are useful because the projects address more than DOM
mutation. They provide an application-level component and lifecycle model,
with mature ecosystems around routing, state, forms, server rendering,
development tools, and testing.

Declarative rendering can be isolated:

```text
React, Vue, or Angular

framework state change
        |
framework scheduling or change detection
        |
framework component and template model
        |
DOM update

Lumi

application produces a data snapshot
        |
application calls update(data)
        |
plain JavaScript projections are compared
        |
DOM update
```

The narrower scope does not replace the complete role of these projects. It
removes the need to adopt their authoring and runtime models when an
application only needs declarative DOM rendering. The application keeps
authority over data and update timing, HTML remains native HTML, events remain
native events, while only mechanical DOM synchronization is handled here.

This is a scope boundary rather than a claim that less machinery is always
better. A project that wants a framework-managed component lifecycle,
reactivity, scheduling, and ecosystem is outside the intended use case.

## One concrete component

The template is ordinary HTML:

```html
<template id="counter-template">
  <section class="counter">
    <output>count is <span data-path="$.count">0</span></output>
    <button
      data-action="decrement"
      data-disabled
    >Decrement</button>
    <button
      data-action="increment"
      data-disabled
    >Increment</button>
    <ul data-path="$.items[*]">
      <li data-path="$.items[*].name">Item</li>
    </ul>
  </section>
</template>
```

The `data-path` and `data-disabled` values are application-owned metadata and
have no built-in interpretation. The example injects a projection adapter that
returns JSONPath nodelists unchanged. The browser can parse the template
without knowing about either the rendering mechanism or the convention, and
the template retains real default content.

The component owns a presentation function that derives the exact snapshot
required by its template and rendering rules:

```js
let actualData = {
  count: 3,
  maximum: 5,
  items: [
    {name: 'Item 1'},
    {name: 'Item 2'},
    {name: 'Item 3'},
  ],
}

function presentCounter(data) {
  return {
    count: data.count,
    counterDisabled: data.count >= data.maximum,
    decrementDisabled: data.count <= 0,
    items: data.items,
  }
}
```

The presentation snapshot is allowed to contain derived, presentation-specific
values such as `counterDisabled`. They are computed from actual application
data rather than maintained as a second source of truth. Each component owns
the shape and derivation of its own presentation data. A page presentation
function composes those component presentation functions into the snapshot
passed to the root component.

Presentation functions run before rendering. Only their resulting snapshot is
passed through, with no reference to the actual data that produced it.

The rendering rules explicitly connect that snapshot to the application-side
adapter:

```js
const slot = document.querySelector('#counter-slot')

const counter = component({
  template: document.querySelector('#counter-template'),
  bindings: [
    text(
      '[data-path]',
      ({data}, element) => jsonPath(data, element.dataset.path),
    ),
    prop(
      '[data-disabled]',
      ({data}) => data.counterDisabled,
      'disabled',
    ),
    on('[data-action="increment"]', 'click', () => {
      const count = actualData.count + 1
      actualData = {
        ...actualData,
        count,
        items: [...actualData.items, {name: `Item ${count}`}],
      }
      counter.update(presentCounter(actualData))
    }),
    on('[data-action="decrement"]', 'click', () => {
      const count = Math.max(0, actualData.count - 1)
      actualData = {
        ...actualData,
        count,
        items: actualData.items.slice(0, count),
      }
      counter.update(presentCounter(actualData))
    }),
  ],
}).mount(slot)

counter.update(presentCounter(actualData))
```

The `on` declarations manage native listeners at the component
boundary. The application handlers still decide the next actual data and call
`update()` explicitly; Lumi does not synthesize events or state transitions.

The actual data and presentation snapshot contain no DOM nodes, selectors, or
handlers. The application adapter may interpret inert metadata, but no
expression language is built in. The application never assigns `textContent`
or `disabled`.

That separation is the core of the design.

Actual data and presentation data may have any ordinary JavaScript shapes the
application needs. No store, schema, proxy, base class, or special object type
is required. The constraint is about ownership: the application owns actual
data, each component owns its presentation data, and neither smuggles rendering
instructions or DOM objects into the snapshot.

At the application boundary, one page has one update operation. Calling
`update(pageData)` updates the active component tree. Nested components
receive their relevant data through that update rather than becoming
independently scheduled mini-applications. A document may deliberately mount
multiple independent roots, but a separate update call for every component is
not required.

## What an update actually does

Mounting happens once. The template is cloned, replaces the mount target's
existing contents, and has its bindings connected to that component boundary.
Scalar selectors are resolved again for each explicit update, so structural
rules may create or remove later scalar targets without leaving stale
references to detached nodes.

Each explicit `update(data)` call proceeds as follows:

1. Receives the complete data snapshot from the application.
2. Identifies structural dependencies between the current selector matches.
   Independent leaf rules use the live DOM only as a read-only preparation
   view.
3. When dependencies exist, imports the component tree into an inert document
   that cannot construct another instance of a live custom element, applies
   content-owning rules in ancestor order, and resolves descendant selectors
   against the result.
4. Runs every matching projection and validates structural data without
   mutating the live DOM. An unmatched scalar selector is a no-op.
5. Recursively prepares the active component tree.
6. Discards the complete plan without live DOM changes if preparation fails.
7. Replays the prepared DOM operations on persistent live nodes, compares
   projected values with owned DOM state or its safely cached representation,
   and writes only differences.
8. Reconciles positional structural regions and nested child components.
9. Retains projected values needed to avoid redundant DOM writes.

This separation makes projection and validation failures recoverable: the
previous live component tree remains authoritative and a later update may be
attempted.

DOM commit itself cannot be completely transactional. A native property or
custom-element setter can perform arbitrary side effects before throwing, and
those effects cannot be safely reversed by a general renderer. A commit error
therefore faults the mounted component. It may be unmounted, but the
application must mount a fresh boundary before rendering again.

With the example above, rendering
`{ count: 3, counterDisabled: false }` projects:

```text
.counter-value     textContent -> 3
.counter-increment disabled    -> false
```

Rendering `{ count: 4, counterDisabled: false }` next changes only the output
text. The disabled projection is still `false`, so there is no
disabled-property write.

Rendering the same projected values again performs no meaningful DOM writes.
Rendering `{ count: 5, counterDisabled: true }` changes the text and sets
`disabled` to `true`.

Property bindings verify the live DOM value as well as the preceding
projection. This matters for properties such as an input's `value` or
`checked`, which the browser or the user can change between renders. When the
data snapshot owns that property, the next update restores the supplied value.
The binding also remembers native coercion, so projecting the number `1` into a
string-valued property does not cause a write on every update.

This is not reactive dependency tracking. No properties are observed or
subscribed to, and update timing is never inferred from what a function reads.
Declared projections are evaluated when the application calls `update`, then
unnecessary DOM writes are avoided.

The distinction matters:

```text
deciding whether new application data exists  -> application
making the DOM match explicitly supplied data -> renderer
```

JavaScript comparisons are cheap and predictable. DOM mutations can trigger
browser work and can destroy browser-managed state. Optimization therefore
targets DOM mutation without taking control of application data.

## The two directions through the system

Rendering and interaction are separate flows.

Data flows toward the browser:

```text
server, cache, or application state
                |
         plain data snapshot
                |
           update(data)
                |
       persistent native DOM
```

User intent flows back toward the application:

```text
native click, input, or submit
                |
      stable native listener
                |
 application decision or request
                |
       next data snapshot
                |
           update(data)
```

Only the data-to-DOM translation happens here. Native JavaScript owns the
interaction path, and application state connects an event to a later explicit
update.

If the user clicks Increment, the application may accept it, reject it, send
it to a server, update several models, navigate elsewhere, or do nothing.
Rendering does not observe the event. If authoritative data changes, the
application calls `update` with the result.

## Ownership boundaries

Each piece has one job and one kind of authority.

| Part | Receives | Owns | Must not decide |
| --- | --- | --- | --- |
| Application | Events, server results, stored state | Data, business rules, routing, state transitions, update timing | DOM mechanics |
| HTML template | Browser parsing | Semantic structure and useful default content | Application behavior |
| Component rules | A data snapshot | Data-to-DOM projections | Authoritative state, behavior, or network activity |
| Renderer | Rules, mounted DOM, explicit data | Stable bindings, comparisons, minimal writes, reconciliation, cleanup | When data changed or what the business should do |
| Browser | HTML, CSS, DOM operations | Parsing, elements, events, forms, focus, layout, accessibility, ephemeral UI state | Application state |

### The application owns data and decisions

The application owns:

- The authoritative data snapshot.
- Fetching, GraphQL, REST, WebSockets, caches, and server communication.
- Business logic and state transitions.
- Routing and choosing the active page or layout.
- Handling native UI events.
- Deciding when to call `update(nextData)`.

The application may attach native behavior listeners to persistent elements
or delegate them from a component root. It should not patch rendered text and
properties or manually arrange component nodes.

### The template owns structure

The template owns:

- Native semantic elements and their relationships.
- Useful initial or fallback content.
- Native controls such as buttons, forms, links, `details`, dialogs, and
  popovers.
- Locations that ordinary selectors, element references, or slots can
  identify.
- Inert reusable markup through `<template>` where appropriate.

Templates may already be in the page, be included by the server or a build
step, or be fetched explicitly. Importing HTML should use those mechanisms
instead of imitating a browser feature. Packaging is separate from rendering.

### Component rules own projection

Component rules say how data affects declared DOM state:

- Text.
- DOM properties.
- Attributes.
- Classes and inline styles.
- Conditional regions.
- Positional repeated regions.
- Child components.

Projection functions should be pure: the same data should produce the same
projected value without fetching, mutating application state, or manipulating
unrelated DOM.

### Mechanical synchronization

Responsibilities include:

- Resolving rules to persistent real DOM nodes.
- Caching prior projected values.
- Applying minimal text, property, attribute, class, and style writes.
- Reconciling structural regions without discarding stable nodes and with the
  fewest practical physical moves.
- Preserving component instances across page and layout composition.
- Hiding compatibility shims behind the same component contract.
- Reporting useful binding and component failures during development.

Writes produced by one update call may be collected and batched, but update
timing must not be hidden behind a scheduler.

### The browser owns browser state

The browser already owns:

- Real DOM node identity.
- Event capture, bubbling, cancellation, and default actions.
- Form controls, validation, and `FormData`.
- Focus, selection, scroll position, media playback, and open controls.
- HTML parsing and CSS layout.
- Animation and responsive placement.
- Accessibility semantics.
- Shadow DOM, slots, custom elements, and their native lifecycles.

These capabilities should be used, not emulated. Avoiding unnecessary node
replacement is important because a replacement can discard state that was
never present in the application data.

## One writer for each piece of DOM

Ordinary JavaScript must still be able to use the DOM. The safe boundary is
ownership, not a ban on imperative code.

- If a rendering rule binds an element's text, property, attribute, children,
  or placement, that state belongs to the binding.
- If no rendering rule owns a piece of DOM state, the browser or application
  may own it and renders leave it unchanged.
- A third-party widget or imperative controller may own an explicitly opaque
  subtree. It may be preserved or moved as one unit but must not be reconciled
  internally.

For example, if a rule binds an input's `value`, the data snapshot owns that
value and rendering writes changes to it. Without that binding, user input and
browser state own the value and renders must leave it alone.

Multiple built-in rules may deliberately overlap. Ownership is tracked at the
sink level: `textContent`, one named property, one named attribute, one class
token, one style property, or a child subtree. Different sinks on the same
element are independent. If multiple built-in rules reach the same sink, they
run deterministically and the last declaration wins.

Content sinks also define DOM dependencies. An ancestor content write is
prepared before rules for its descendants are resolved, regardless of
declaration order. The descendant selector sees the prepared parent result. If
that result removed the descendant, the selector has no matches and does
nothing. If it created matching descendants, their projections run in the same
update.

This overlap rule does not grant imperative or opaque custom code shared
ownership. A custom binding's writes are not visible to the DOM planner, and
imperative code can invalidate cached comparisons. Those writers must still
own separate sinks. `child` subtrees are explicit component
boundaries: parent scalar selectors do not enter them, and a parent content
write that would replace one is rejected before commit. The exact API for
declaring another kind of opaque subtree remains open, but it must be ordinary
JavaScript rather than an HTML directive.

## Events and buttons

A button is a real `<button>`. A form is a real `<form>`. Their keyboard
behavior, accessibility, default actions, validation, and bubbling come from
the browser.

`on(selector, type, handler, options?)` declares one native event
relationship inside Lumi-owned DOM. Lumi owns listener placement and cleanup;
the browser owns event behavior. The native event object, capture, bubbling,
cancellation, listener options, default actions, and Shadow DOM behavior
remain intact; there is no synthetic event system.

The default, `{at: 'component'}`, routes the event through the component's own
event boundaries. Compatible declarations — same boundary, type, `capture`,
and `passive` — share one logical router, and one managed listener keeps
working for matching elements created by later structural updates. Lumi
restricts the event's composed path to DOM the component owns, excludes DOM
owned by nested components, and passes the closest matching element to the
handler. `event.currentTarget` remains the routing boundary rather than a
rewritten value, because rewriting it would require a wrapped event.

`{at: 'elements'}` instead maintains native listeners on every matching
element and reconciles that set after each successful update. It is the
explicit answer for non-bubbling events, exact target-listener semantics, and
`event.currentTarget` on the matched element. Lumi never rewrites an event
type or silently promotes a declaration to capture to make a non-bubbling
event reachable; a development warning names the two explicit choices instead.

How often a declaration runs is an enum rather than a boolean.
`{freq: 'once'}` states that one declaration may run at most once for the
lifetime of a mounted component, independent of how many elements match or how
often they are recreated. That lifetime belongs to the Lumi binding, not to an
incidental native listener, so Lumi does not pass a native `once` to a shared
router or rely on per-element native `once`. Keeping it an enum leaves room
for a later per-element frequency without reinterpreting existing
declarations.

Application code may still use `addEventListener()` directly when component
routing or component-managed cleanup is not appropriate. Lumi manages events
only on DOM it owns; `window`, `document`, media queries, and sockets stay
application concerns with application-owned cleanup.

A template may expose an application-owned hook:

```html
<button data-action="increment" type="button">Increment</button>
```

The attribute has no behavior on its own. Application JavaScript gives it
meaning by using `[data-action="increment"]` as an ordinary CSS selector. This
provides a common hook shape for different application actions while keeping
each callback explicit. No `data-*` name is reserved or scanned, and action
values are neither dispatched nor resolved to functions.

This is deliberately rejected:

```html
<button data-on-click="increment">Increment</button>
```

`increment` is not meaningful to the browser. Supporting it would require new
rules for name lookup, scope, arguments, errors, and lifecycle. The attribute
therefore creates a small behavior language inside HTML.

An ordinary JavaScript callback already has lexical scope, types, imports,
tooling, and predictable errors. The application should use it.

## Pages, templates, and persistent components

A document may contain several inert `<template>` definitions while one page
composition is live. Templates may contain useful default content or a loader.

Changing pages selects a different composition of component instances. It
does not require a new kind of component.

The SPA example uses a small application-owned registry so each script can
declare `template`, `bindings`, and `present` beside its native template. Its
application module holds flat shell and route placement plans. Every plan entry
explicitly names `at`, the registered definition to `use`, and an optional
data-selection function. One plan loop derives all presentations and calls the
mounted Lumi components, avoiding repeated render plumbing without adding
another component or lifecycle model.

This keeps the two structural responsibilities separate:

- The application placement plan composes, retains, moves, and releases
  component instances.
- `repeat` reconciles repeated DOM occurrences inside one component.

`child` remains available as a renderer binding for a locally owned nested
component, but route composition does not need to encode application pages as
nested component bindings.

A shared component should keep its DOM identity when it moves from one layout
region to another. Placement should prefer:

1. CSS layout when only visual position changes.
2. Native slot projection when a component moves between declared regions.
3. Moving the existing DOM subtree when physical reparenting is necessary.

Recreating the component is the last resort because recreation can discard
focus, selection, input state, media playback, internal widget state, and
other information the browser is already maintaining.

All components obey the same contract. There is no easy component, advanced
component, reactive component, or escape-hatch component.

## HTML, scripts, and styles

HTML should remain HTML. It may live in an ordinary document or HTML fragment
and be parsed by the browser. It should not primarily live in JavaScript
strings.

Controller modules should be loaded or registered explicitly. Scripts inside
cloned template markup are not the lifecycle model. Repeatedly activating a
template must not accumulate script elements, listeners, or abandoned nodes.

Styles may be kept near a component template, but proximity alone does not
scope CSS. Isolation must come from an actual browser mechanism such as
Shadow DOM, supported CSS scoping, or an explicit compatibility strategy.

A component may be packaged as ordinary `.html`, `.js` or `.ts`, and `.css`
files. An ordinary document may also link a module and stylesheet using native
elements. Packaging must not create a new runtime language or depend on cloned
scripts executing as a side effect of inserting markup.

Text data uses `textContent` semantics by default. A string is data even if it
contains characters that resemble markup or placeholders.

Native event handler properties and attributes are rejected because event
handling remains separate. `srcdoc` remains rejected. Otherwise `prop()`
preserves the native property surface. `innerHTML` and `outerHTML` require a
genuine `TrustedHTML` value authenticated in the mounted document's realm;
strings and lookalike objects fail during preparation. The application owns
the Trusted Types policy and any sanitization it performs. A `data-html` name
has no meaning unless application code injects that convention. URL trust
remains an application boundary because a correct policy depends on whether a
URL is navigation, media, or an executable resource.

## No imposed template language

This is the hardest boundary.

Components use three languages the browser and tooling already understand:

- HTML for structure.
- CSS for presentation.
- JavaScript or TypeScript for rules and behavior.

A construct is inside the boundary when an existing language or published
standard defines its semantics. Calling
`text('.value', ({data}) => data.count)` uses a normal JavaScript function, native
selector syntax, and a callback. The API defines the function's behavior but
does not parse the callback or selector as a separate language.

A construct is outside the boundary when it requires parsing or interpreting a
string as application behavior:

```html
<!-- Rejected: these require interpretation beyond HTML. -->
<output>{{ count }}</output>
<section lumi-if="account.enabled"></section>
<button data-on-click="increment">Increment</button>
```

Other rejected features include a custom file format, compiler-required
template syntax, string property paths, expression strings, implicit global
handler names, and runtime evaluation of application code.
Applications remain free to inject their own projection conventions through
ordinary JavaScript; the counter's example-local JSONPath adapter demonstrates
that boundary.

An independent adapter may deliberately define a small language in `data-*`
metadata, provided that it owns and documents the parsing, scope, errors, and
lifecycle. The rendering API still receives ordinary selectors, projection
functions, and JavaScript values. The example's `data-path` path is therefore
a language owned by `jsonPath`, not a hidden template language.

The API itself should stay unsurprising JavaScript. It must not grow clever
chaining, control-flow keywords, or conventions that amount to a language
implemented through function calls.

## Browser-first implementation preferences

Use existing platform primitives when they satisfy the contract:

- `<template>` and `DocumentFragment`.
- Native DOM nodes, properties, attributes, and selectors.
- Native events, `CustomEvent`, capture, and bubbling.
- `AbortSignal` for listener cleanup.
- Forms, constraint validation, and `FormData`.
- CSS Grid, Flexbox, and responsive CSS for placement.
- Shadow DOM, declarative Shadow DOM, and slots.
- Custom elements when their lifecycle and interoperability are useful.
- `hidden`, dialogs, popovers, and other semantic platform state.

Newer primitives may be used behind capability checks. Compatibility code
belongs below the component contract, so old and new browsers do not require
different component definitions.

A shim must not promise behavior it cannot preserve. If a browser cannot
retain some ephemeral state during a physical move, the support boundary
should be documented rather than introducing another authoring model.

## Intentional exclusions

The design must not:

- Invent syntax, a template language, an expression language, or a file
  format.
- Introduce single-file components, placeholder expressions, HTML behavior
  directives, string handler names, built-in string property paths, runtime
  evaluation, or a parser for application expressions.
- Make JavaScript strings the primary home of HTML.
- Add signals, proxies, watchers, subscriptions, dependency tracking,
  computed graphs, or automatic rerendering.
- Add or infer keyed identity for array repetition. Repeated occurrence
  identity is deliberately positional.
- Become a state manager, store, router, data cache, network client, GraphQL
  layer, server protocol, or business-logic runtime.
- Decide whether application data changed. It only makes the DOM match data
  that was explicitly supplied.
- Introduce a synthetic event system or hide native event behavior.
- Mutate application data in response to an event.
- Require data to contain DOM nodes, markup, callbacks, or special mutable
  objects.
- Expose manual DOM mutation as the normal component-authoring model.
- Maintain an application-facing virtual DOM or diff an entire tree when
  stable bindings identify the relevant locations.
- Replace persistent nodes merely because `update` was called.
- Overwrite browser-owned or imperative state that no rendering rule owns.
- Let a binding and an imperative or opaque custom writer control the same DOM
  property or subtree.
- Create separate simple and advanced component systems.
- Require a build step for runtime meaning. TypeScript and builds may provide
  checks, packaging, and optimization, but the model remains HTML, CSS, and
  JavaScript.
- Execute controller scripts merely because template markup was inserted.
- Claim that adjacent styles are scoped when the browser treats them as
  global.
- Depend on experimental browser behavior without a fallback or explicit
  support boundary.
- Hide application update timing behind an automatic scheduler.

## Design acceptance tests

The design remains intact only if all of these stay true:

- A component template is valid ordinary HTML.
- Computed component rules are valid ordinary JavaScript or TypeScript.
- No parser or syntax transform is needed to understand component
  behavior.
- One explicit page update updates its active component tree.
- The data snapshot contains values, not presentation or behavior.
- Useful default content can exist before rendering begins.
- Calling `update` twice with identical projected values performs no
  meaningful DOM writes.
- A projection or structural-validation failure performs no live DOM writes
  and does not prevent a later valid update.
- A parent content rule may create or remove a descendant binding target in
  the same update; the descendant selector sees the prepared result.
- An unmatched scalar selector is a no-op.
- Overlapping built-in selector sets are deterministic, and the last
  declaration wins when they reach the same sink.
- Scalar bindings reject projection results outside their declared value
  types instead of relying on implicit DOM string or boolean coercion.
- Empty repeat arrays produce zero elements, nested repeats preserve their
  dimensions, and repeated element identity remains positional across renders.
- Changing one scalar projection changes only its bound DOM state.
- An unbound DOM property remains untouched.
- An opaque imperative subtree survives renders unchanged.
- Changing layouts can relocate a shared component without recreating it.
- Native application listeners remain attached because their elements persist
  across renders.
- A click or submit stays native. The application decides the next data and
  explicitly renders it.
- A compatibility implementation does not change how components are written.

These tests protect the architecture better than a feature checklist. A
feature that fails one of them must be redesigned or kept outside the API.

## Questions intentionally left open

These require prototypes and measurements:

- The smallest useful typed binding API.
- How conditional and repeated regions are anchored in ordinary HTML.
- How an opaque, imperatively owned subtree is registered.
- How component definitions stored outside the active document are packaged.
- Browser support targets and the features worth shimming.
- Optional batching details within the synchronous commit phase.
- Style-isolation options.
- Sanitization policy recommendations beyond the TrustedHTML boundary.
- Development diagnostics, cleanup, and error containment.

Each answer must pass the same test: does it remove difficult DOM manipulation
while leaving HTML, CSS, JavaScript, browser behavior, and application
ownership recognizable?

## Related approaches

PURE.js and Transparency explored plain HTML with external data-to-DOM rules.
morphdom and Mikado contain lessons about reconciling real DOM while
preserving identity. Proposed DOM Parts work explores whether the platform can
expose stable update locations directly.

The design draws on lessons from these projects while retaining its own
component and ownership model. Dependencies are evaluated against that model,
including the requirement to use existing web languages.
