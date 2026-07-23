# Lumi design

Lumi is a small browser-first rendering layer.

Lumi has one responsibility: declarative DOM rendering. Application code
describes what the DOM should show, and Lumi finds, creates, moves, and updates
the necessary DOM nodes.

```text
native HTML + ordinary JavaScript or TypeScript rules + a data snapshot
                                  |
                              render(data)
                                  |
                     minimal writes to the real DOM
```

Give Lumi data and it renders. Give it different data and it renders again.
Lumi does not fetch the data, watch it for changes, or decide when another
render should happen.

Lumi is not a framework around the browser. It is the missing mechanical step
between plain data and persistent native DOM.

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
- How nodes survive conditionals, list reordering, and layout changes.

The difficult part is not assigning `textContent` once. It is preserving the
correct relationship between changing data and long-lived browser state as
the page grows.

Lumi moves that relationship into declarative JavaScript rules. Application
code remains responsible for data and decisions. The browser remains
responsible for the DOM and native behavior. Lumi performs the repetitive
translation between them.

## One concrete component

The template is ordinary HTML:

```html
<template id="counter-template">
  <section class="counter">
    <output class="counter-value">0</output>
    <button class="counter-increment" type="button">Increment</button>
  </section>
</template>
```

There are no placeholders, directives, action names, or expressions in the
markup. The browser can parse it without knowing Lumi exists. The initial
`0` is real default content.

The component's rendering rules are ordinary JavaScript functions. The exact
API is not decided, but its conceptual shape is:

```js
const counterDefinition = component({
  template: document.querySelector('#counter-template'),

  bindings: [
    text('.counter-value', data => data.count),
    property(
      '.counter-increment',
      'disabled',
      data => data.count >= data.maximum,
    ),
  ],

  events: [
    on('.counter-increment', 'click', ({ root, data }) => {
      root.dispatchEvent(new CustomEvent('counter:increment-requested', {
        bubbles: true,
        composed: true,
        detail: { id: data.id },
      }))
    }),
  ],
})
```

This example illustrates responsibilities, not a committed API. `component`,
`text`, `property`, and `on` are regular JavaScript functions. Selectors,
properties, event names, callbacks, and `CustomEvent` already belong to the
web platform. Lumi must not create another grammar around them.

The application mounts the component, supplies data, responds to its semantic
event, and renders the resulting data:

```js
const slot = document.querySelector('#counter-slot')
const counter = counterDefinition.mount(slot)

let model = {
  id: 'primary-counter',
  count: 3,
  maximum: 5,
}

slot.addEventListener('counter:increment-requested', event => {
  if (event.detail.id !== model.id) return

  model = { ...model, count: model.count + 1 }
  counter.render(model)
})

counter.render(model)
```

The model contains no HTML, DOM nodes, selectors, or handlers. The template
contains no application expressions. The application never assigns
`textContent` or `disabled`.

That separation is the core of Lumi.

The data may have any ordinary JavaScript shape the application needs. Lumi
does not require a store, schema, proxy, base class, or special object type.
The constraint is about ownership: data describes application state and does
not smuggle rendering instructions or DOM objects into the renderer.

At the application boundary, one page has one render operation. Calling
`render(pageData)` updates the active component tree. Nested components
receive their relevant data through that render rather than becoming
independently scheduled mini-applications. A document may deliberately mount
multiple independent roots, but Lumi does not require the application to
coordinate a render call for every component.

## What a render actually does

Mounting happens once. Lumi clones or adopts the template, resolves each
binding to a real DOM node, installs stable native listeners, and keeps those
references for later renders.

For every explicit `render(data)` call, Lumi:

1. Receives the complete data snapshot from the application.
2. Runs every declared projection function against that snapshot.
3. Compares each projected value with the value produced by the preceding
   render.
4. Writes only changed values to their already-resolved DOM targets.
5. Reconciles declared conditional or repeated regions by stable identity.
6. Retains the new snapshot and projected values for the next call.

With the example above, rendering `{ count: 3, maximum: 5 }` projects:

```text
.counter-value     textContent -> 3
.counter-increment disabled    -> false
```

Rendering `{ count: 4, maximum: 5 }` next changes only the output text. The
disabled projection is still `false`, so Lumi performs no disabled-property
write.

Rendering the same projected values again performs no meaningful DOM writes.
Rendering `{ count: 5, maximum: 5 }` changes the text and sets `disabled` to
`true`.

This is not reactive dependency tracking. Lumi does not observe which
properties a function reads, subscribe to them, or infer that a render is
needed. It simply evaluates the declared projections when the application
calls `render`, then avoids unnecessary DOM writes.

The distinction matters:

```text
deciding whether new application data exists  -> not Lumi
making the DOM match explicitly supplied data -> Lumi
```

JavaScript comparisons are cheap and predictable. DOM mutations can trigger
browser work and can destroy browser-managed state. Lumi optimizes the latter
without taking control of the former.

## The two directions through the system

Rendering and interaction are separate flows.

Data flows toward the browser:

```text
server, cache, or application state
                |
         plain data snapshot
                |
           render(data)
                |
       persistent native DOM
```

User intent flows back toward the application:

```text
native click, input, or submit
                |
      stable native listener
                |
    semantic bubbling event
                |
 application decision or request
                |
       next data snapshot
                |
           render(data)
```

Lumi occupies only the two narrow translation points: data projections on the
way in and semantic event mapping on the way out. It does not own the state
between them.

If the user clicks Increment, Lumi does not increment `count`. The component
reports that an increment was requested. The application may accept it,
reject it, send it to a server, update several models, navigate elsewhere, or
do nothing. If the authoritative data changes, the application calls
`render` with the result.

## Ownership boundaries

Each piece has one job and one kind of authority.

| Part | Receives | Owns | Must not decide |
| --- | --- | --- | --- |
| Application | Events, server results, stored state | Data, business rules, routing, state transitions, render timing | DOM mechanics |
| HTML template | Browser parsing | Semantic structure and useful default content | Application behavior |
| Component rules | A data snapshot or native event | Data-to-DOM projections and event-to-intent mapping | Authoritative state or network activity |
| Lumi renderer | Rules, mounted DOM, explicit data | Stable bindings, comparisons, minimal writes, reconciliation, cleanup | When data changed or what the business should do |
| Browser | HTML, CSS, DOM operations | Parsing, elements, events, forms, focus, layout, accessibility, ephemeral UI state | Application state |

### The application owns data and decisions

The application owns:

- The authoritative data snapshot.
- Fetching, GraphQL, REST, WebSockets, caches, and server communication.
- Business logic and state transitions.
- Routing and choosing the active page or layout.
- Receiving semantic UI events.
- Deciding when to call `render(nextData)`.

The application should not need to find elements, patch text, attach component
listeners, or manually arrange component nodes.

### The template owns structure

The template owns:

- Native semantic elements and their relationships.
- Useful initial, server-rendered, or fallback content.
- Native controls such as buttons, forms, links, `details`, dialogs, and
  popovers.
- Locations that ordinary selectors, element references, or slots can
  identify.
- Inert reusable markup through `<template>` where appropriate.

Templates may already be in the page, be included by the server or a build
step, or be fetched explicitly. Lumi should not fake a browser feature for
importing HTML. Packaging is separate from rendering.

### Component rules own projection

Component rules say how data affects declared DOM state:

- Text.
- DOM properties.
- Attributes.
- Classes and inline styles.
- Conditional regions.
- Repeated, keyed regions.
- Child components.

They also map native events to semantic events. Projection functions should
be pure: the same data should produce the same projected value without
fetching, mutating application state, or manipulating unrelated DOM.

### Lumi owns mechanical synchronization

Lumi owns:

- Resolving rules to persistent real DOM nodes.
- Caching prior projected values.
- Applying minimal text, property, attribute, class, and style writes.
- Reconciling structural regions without discarding stable nodes.
- Installing listeners once and cleaning them up.
- Adopting compatible server-rendered DOM.
- Preserving component instances across page and layout composition.
- Hiding compatibility shims behind the same component contract.
- Reporting useful binding, key, and adoption failures during development.

Lumi may collect and batch writes produced by one render call. It must not
introduce a hidden scheduler that decides when the application renders.

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

Lumi should cooperate with these capabilities, not emulate them. Avoiding
unnecessary node replacement is important because a replacement can discard
state that was never present in the application data.

## One writer for each piece of DOM

Ordinary JavaScript must still be able to use the DOM. The safe boundary is
ownership, not a ban on imperative code.

- If a Lumi rule binds an element's text, property, attribute, children, or
  placement, Lumi owns that state.
- If no Lumi rule owns a piece of DOM state, the browser or application may
  own it and Lumi leaves it unchanged.
- A third-party widget or imperative controller may own an explicitly opaque
  subtree. Lumi may preserve or move that subtree as one unit but must not
  reconcile inside it.

For example, if Lumi binds an input's `value`, the data snapshot owns that
value and Lumi writes changes to it. If Lumi does not bind `value`, user input
and browser state own it and renders must leave it alone.

Two writers must not compete over the same property or subtree. Otherwise a
render could undo an imperative change, while imperative code could invalidate
Lumi's remembered value. The exact API for declaring an opaque subtree remains
open, but it must be declared in ordinary JavaScript rather than by inventing
an HTML directive.

## Events and buttons remain native

A button is a real `<button>`. A form is a real `<form>`. Their keyboard
behavior, accessibility, default actions, validation, and bubbling come from
the browser.

Lumi's event rules are:

- Attach listeners to persistent real elements and install them once.
- Give handlers actual native `Event` objects and real function references.
- Let a stable listener see the latest rendered data without reinstalling it.
- Preserve native capture, bubbling, cancellation, and default actions.
- Use bubbling `CustomEvent`s for component-level intentions where useful.
- Use `composed: true` when an event intentionally crosses a Shadow DOM
  boundary.
- Keep `preventDefault()` and `stopPropagation()` explicit. Propagation should
  rarely be stopped.
- Handle a form's `submit` event rather than assuming one button click is the
  only way to submit it.

Direct listeners are the conceptual model. Lumi may use delegation internally
when it has identical behavior, but that is an optimization. It should map
actual nodes to functions, for example with a `WeakMap`, rather than turn HTML
attributes into a handler registry.

This is deliberately rejected:

```html
<button data-on-click="increment">Increment</button>
```

`increment` is not meaningful to the browser. Supporting it requires Lumi to
invent name lookup, scope, argument, error, and lifecycle rules. The attribute
therefore creates a small behavior language inside HTML.

An ordinary JavaScript callback already has lexical scope, types, imports,
tooling, and predictable errors. Lumi should use it.

## Pages, templates, and persistent components

A document may contain several inert `<template>` definitions while one page
composition is live. The live page may begin as server-rendered content,
useful default content, or a loader. Lumi does not care where its first data
snapshot came from.

Changing pages selects a different composition of component instances. It
does not require a new kind of component.

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

## Initial and server-rendered DOM

Server rendering is not a second architecture. It is one possible source of
the live DOM before the first client render.

When compatible DOM already exists, Lumi should:

1. Find the existing nodes that correspond to the component rules.
2. Attach its stable bindings and listeners to those nodes.
3. Compare the first supplied data projections with the existing DOM.
4. Change only mismatches.

This association of rules with existing nodes is often called adoption or
hydration. The concrete requirement matters more than the term: a compatible
server-rendered button must remain the same button after Lumi starts.

If the existing DOM cannot be associated safely, development mode should
explain the mismatch. A controlled rebuild may be necessary, but silent
replacement must not be the normal path.

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
contains characters that resemble markup or placeholders. Rendering trusted
HTML must be a separate explicit operation with a defined sanitization and
Trusted Types boundary.

## No new language

This is the hardest boundary.

Lumi components use three languages the browser and tooling already
understand:

- HTML for structure.
- CSS for presentation.
- JavaScript or TypeScript for rules and behavior.

A construct is inside the boundary when the existing language parser
understands its semantics. Calling `text('.value', data => data.count)` uses a
normal JavaScript function, native selector syntax, and a callback. Lumi
defines what its function does, as every library does, but it does not parse
the callback or selector as Lumi code.

A construct is outside the boundary when Lumi must parse or interpret a
string as application behavior:

```html
<!-- Rejected: Lumi would need to interpret these. -->
<output>{{ count }}</output>
<section lumi-if="account.enabled"></section>
<button data-on-click="increment">Increment</button>
```

Also rejected are a Lumi-specific file format, a compiler-required template
syntax, string property paths, expression strings, implicit global handler
names, and runtime evaluation of application code.

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
retain some ephemeral state during a physical move, Lumi should document the
support boundary rather than introduce another authoring model.

## What Lumi intentionally avoids

Lumi must not:

- Invent syntax, a template language, an expression language, or a file
  format.
- Introduce single-file components, placeholder expressions, HTML behavior
  directives, string handler names, string property paths, runtime evaluation,
  or a parser for application expressions.
- Make JavaScript strings the primary home of HTML.
- Add signals, proxies, watchers, subscriptions, dependency tracking,
  computed graphs, or automatic rerendering.
- Become a state manager, store, router, data cache, network client, GraphQL
  layer, server protocol, or business-logic runtime.
- Decide whether application data changed. It only makes the DOM match data
  that was explicitly supplied.
- Introduce a synthetic event system or hide native event behavior.
- Mutate application data in response to an event.
- Require data to contain DOM nodes, markup, callbacks, or mutable Lumi
  objects.
- Expose manual DOM mutation as the normal component-authoring model.
- Maintain an application-facing virtual DOM or diff an entire tree when
  stable bindings identify the relevant locations.
- Replace persistent nodes merely because `render` was called.
- Overwrite browser-owned or imperative state that no Lumi rule owns.
- Let Lumi and another writer control the same DOM property or subtree.
- Create separate simple and advanced component systems.
- Require a build step for runtime meaning. TypeScript and builds may provide
  checks, packaging, and optimization, but the model remains HTML, CSS, and
  JavaScript.
- Execute controller scripts merely because template markup was inserted.
- Claim that adjacent styles are scoped when the browser treats them as
  global.
- Depend on experimental browser behavior without a fallback or explicit
  support boundary.
- Hide application render timing behind an automatic scheduler.

## Design acceptance tests

The design is still Lumi only if all of these remain true:

- A component template is valid ordinary HTML.
- Component rules are valid ordinary JavaScript or TypeScript.
- No Lumi parser or syntax transform is needed to understand component
  behavior.
- One explicit page render updates its active component tree.
- The data snapshot contains values, not presentation or behavior.
- Useful default or server-rendered content can exist before Lumi runs.
- Calling `render` twice with identical projected values performs no
  meaningful DOM writes.
- Changing one scalar projection changes only its bound DOM state.
- An unbound DOM property remains untouched.
- An opaque imperative subtree survives renders unchanged.
- Reordering keyed data preserves the corresponding element identities.
- Changing layouts can relocate a shared component without recreating it.
- Compatible server-rendered DOM is adopted rather than replaced.
- Each native listener is installed once and sees the latest rendered data.
- A click or submit produces an intention. The application decides the next
  data and explicitly renders it.
- A compatibility implementation does not change how components are written.

These tests protect the architecture better than a feature checklist. A
feature that fails one of them must be redesigned or kept outside Lumi.

## Questions intentionally left open

These require prototypes and measurements:

- The smallest useful typed binding API.
- How rules obtain stable element references without adding template syntax.
- How conditional and repeated regions are anchored in ordinary HTML.
- Key requirements and failure behavior for repeated data.
- How an opaque, imperatively owned subtree is registered.
- How component definitions stored outside the active document are packaged.
- Exact server-DOM adoption and mismatch behavior.
- Browser support targets and the features worth shimming.
- Synchronous commit and optional batching details within one render.
- Style-isolation options.
- Trusted HTML and sanitization integration.
- Development diagnostics, cleanup, and error containment.

Each answer must pass the same test: does it remove difficult DOM manipulation
while leaving HTML, CSS, JavaScript, browser behavior, and application
ownership recognizable?

## Related approaches

PURE.js and Transparency explored plain HTML with external data-to-DOM rules.
morphdom and Mikado contain lessons about reconciling real DOM while
preserving identity. Proposed DOM Parts work explores whether the platform can
expose stable update locations directly.

Lumi draws on the implementation lessons from these projects while retaining
its own component and ownership model. Dependencies are evaluated against that
model, including the requirement to use existing web languages.
