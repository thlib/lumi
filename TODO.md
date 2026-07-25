# TODO

- SPA example should use some build step to bundle and minify, this boosts lumi benchmarks
- Docs should pin the ergonomics of having script near the dom that it manipulates
- SPA example should not rely on a framework but should still separate common logic from page logic, like form handling is common but loaded only for pages with forms
- Clarify 
  - **`null`, `undefined`, or other primitives** throw a `TypeError`.
    Arrays must also be dense — a hole (`[1, , 3]`) throws
    ([:489](../src/cardinality.js#L489)).