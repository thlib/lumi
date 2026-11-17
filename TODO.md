# TODO

- add 3 languages english, mandarin chinese, hindi, use i18n where you have t(txt) and n(txt, count) and ideally some standard (I assume .po files are a bit dated now?) way to host translation strings. where the txt is not english, it's an english like contextual placeholder, for example instead of saying "letter" it adds context to what that letter actually means using a `prefix_` (I wonder why english can't remain the translation string with an additional argument that gives context?), or actually make it 4. en + zh-Hans + ar + ua (ukraine), the base string for `t` should be simplified developer english without plurals.
- aren't things like `tone-cream` absolutely smelly? the class should instead describe the _meaning_ and the css should pick the color for the meaning, this allows better dark/light theme too.
- also I do want opening tags to be multi-line when they are twice as long as the standard size at which they normally become multi-line.
- remove people id's from css
- remove widths from css
- remove classes that are colors
- remove `background-color`
- remove the unused styles
- fix the mini-bars
- `data-form-kind="create-team"` is wrong.
- `data-toast="create"` with what msg?
- remove the actual `data-path` attr from the final html
- Mounting should hydrate - not destroy
- Can we make the lumi source smaller without losing functionality or performance?
- Consider assigning clear ownership to a component subtree because it's simpler and more reliable... but mixed ownership can be valuable.
- SSR and hydration?




----


I read the source and ran a few probes. My recommendation is to deepen the things only Lumi has (selector-addressed HTML, prepare/commit, sink ownership, live-DOM comparison, cardinality) instead of adding features. Four of the findings below are defects I confirmed by running code.

## Confirmed problems

- **Selector resolution has two different behaviors, and one faults the component.** I tested `classToggle('.row', 'open', …)` together with `text('.row.open .label', …)`:
  - Without a `repeat` in the component, the first update leaves the label stale and a second identical update fixes it. Setting `open` to false then throws `Lumi DOM changed while committing selector`, which faults the component permanently.
  - With a `repeat` in the component, the selector is resolved once at connect and the label never updates.

  I would choose one rule: selectors are static addresses into the template, as the repeat planner already treats them, with dynamic resolution only for content made by `innerHTML`. This removes the two `querySelectorAll` calls per binding per update. It should also let the two planners in [plan.js](src/plan.js) and [cardinality.js](src/cardinality.js) merge, which would answer your TODO item about source size. The cost is that DESIGN.md currently promises re-resolution on each update, so state-dependent selectors would have to move into projections.

- **Keyed reorder moves too many nodes.** Moving the last of 6 items to the front does 5 moves; the minimum is 1. Without `moveBefore`, each move resets focus, animations and iframes, which is the state Lumi promises to keep. The fix is to leave the longest already-ordered run in place.

- **A boolean in an ARIA attribute gives invalid state.** `attr('button', 'aria-expanded', () => true)` writes `aria-expanded=""`, and `false` removes the attribute. A development warning for a boolean projected into `aria-*` would catch this.

- **The benchmark "Cold load" column is not comparable.** The framework examples start through a dynamic `import()`, so their first render happens after the load event. Lumi renders inside `DOMContentLoaded` (27 ms against 8 ms), while first contentful paint is about equal (80–92 ms). Use first contentful paint or a render mark instead.

## Directions that extend what is unique

1. **Adopt existing DOM without a hydration protocol.** Bindings are selectors over plain HTML, and the sinks already compare against the live DOM before writing. A server in any language can emit the HTML, and the first update would write nothing. This needs mount-without-clone and adoption of existing siblings as repeat occurrences. It is already in your TODO; I would rank it first.

2. **Treat a conditional region as cardinality 0 or 1.** The demo fabricates `selectedMember ?? data.members[0]` so hidden bindings do not throw ([index.html:402](examples/spa/lumi-native/index.html#L402)). A `repeat` that returns `[]` or `[member]` already expresses presence. Document that as the answer to the open question in DESIGN.md instead of adding a `when()`.

3. **Extend prepare/commit across roots.** The demo's `mountPlan` calls `page.update(data)` and then `shell.update(data)` as separate transactions ([demo-app.js:268](examples/spa/lumi-native/demo-app.js#L268)). A projection error in the second leaves the first committed. The internal `prepareMounted` already exists; a public way to prepare several roots and commit them together would keep the guarantee. Related: `child` receives raw data instead of the context and cannot be used inside `repeat`.

4. **Make ownership and selectors checkable.** A selector typo is a silent no-op and there is no compile step to catch it. Two additions would help:
   - A check function for tests that runs the bindings against the template in the real engine and reports selectors that match nothing.
   - A development-only `MutationObserver` that reports foreign writes to owned sinks.

5. **Publish platform recipes instead of API.** `document.startViewTransition(() => mounted.update(data))` should work as-is, because `update` is synchronous and nodes persist. `content-visibility: auto` on long repeats replaces a virtual list. I did not test either.

## Small fixes

- The API.md quick start uses `text` but does not import it ([API.md:36](API.md#L36)).
- API.md still says projections receive `(data, element)` ([API.md:290](API.md#L290)).
- `prop(selector, project, name)` has a different argument order from `attr`, `classToggle` and `style`.
- The README install instructions point to an npm package that TODO.md says is not yet published.
- README has the typo "standards-bases" ([README.md:133](README.md#L133)).

I would start with the selector rule, because adoption of existing DOM and the size reduction both depend on it.

