# Lumi data-attribute DSL SPA

This experiment keeps all executable behavior in ordinary TypeScript while
making the component HTML declarative through a data-attribute DSL. Reusable templates live in
[`components`](./components/) and route templates live in
[`pages`](./pages/). They contain no inline scripts.

Data attributes opt elements into independently composable Lumi behaviors:

```html
<span data-path="$.data.workspace">Luminate</span>
```

[`behaviors/path.ts`](./behaviors/path.ts) defines that behavior with Lumi's
ordinary `text()` binding. It evaluates the RFC 9535 JSONPath against Lumi's
projection context, so root presentation data is available through
`$.data`, repeated values through `$.item`, and positions through `$.index`.
The repeat, attribute, and property conventions are separate behavior modules
in the same directory. For example, `data-attr` declares an attribute
projection:

```html
<a data-attr="href: $.item.href" data-path="$.item.name">Member name</a>
<span class="avatar" data-attr="data-person: $.item.personId">AL</span>
```

Structural classes such as `avatar` remain static. Additive semantic
attributes such as `data-person`, `data-project`, and `data-direction` carry
dynamic meaning without replacing those classes; the shared stylesheet
decides their colors and dimensions. No palette names or CSS values leak into
the template or presentation model.

Interaction attributes name behavior groups rather than DOM events or hidden
handler functions. `data-navigation="toggle"`, `data-project-filter="active"`,
`data-validate="email"`, and `data-toast="close"` are each owned by their
corresponding TypeScript behavior module, which chooses the appropriate event.
The root definition in [`application.ts`](./application.ts) composes the
modules' exported Lumi bindings.

`data-include` composes the source templates into one root template before
mounting. Lumi therefore manages the application as one component and receives
the typed snapshot produced by [`presentation.ts`](./presentation.ts).

From the repository root, start its development server:

```sh
pnpm run dev:spa:dsl
```

Create the minified output once with:

```sh
pnpm run build:spa:dsl
```

The build strictly checks the `.ts` module graph, bundles it with esbuild, and
emits `dist/app.js`. It assembles the script-free declarative HTML templates into
`dist/index.html`; the browser never loads the source TypeScript.
