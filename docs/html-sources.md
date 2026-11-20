# Component sources in separate HTML files

A component `source` can come from a separate `.html` file. Lumi has no code
for this. The browser loads the file and parses it, and Lumi uses the result
as it uses a `<template>` in the page.

## The source file

Write the file as a usual HTML document. Put each component in a
`<template>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>People component</title>
  </head>
  <body>
    <template id="people">
      <section>
        <h1 class="title">Title</h1>
        <ul>
          <li class="person">Name</li>
        </ul>
      </section>
    </template>
  </body>
</html>
```

Because the file is a usual HTML document, an editor, a formatter, and an
HTML validator can read it.

## Load the file

Use `XMLHttpRequest` with `responseType = 'document'`. The browser then
parses the response with its HTML parser:

```js
function loadDocument(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('GET', url)
    request.responseType = 'document'
    request.onload = () => {
      if (request.status === 200 && request.response) {
        resolve(request.response)
      } else {
        reject(new Error(`Cannot load ${url}: HTTP ${request.status}`))
      }
    }
    request.onerror = () => reject(new Error(`Cannot load ${url}`))
    request.send()
  })
}
```

The status check is necessary. An error page is also an HTML document, thus
the browser parses it without an error.

## Use the source

```js
import {component, repeat, text} from '@thlibjs/lumi'

const loaded = await loadDocument('/components/people.html')

const people = component({
  source: loaded.querySelector('#people'),
  bindings: [
    text('.title', ({data}) => data.title),
    repeat('.person', ({data}) => data.people, [
      text(':scope', ({item}) => item),
    ]),
  ],
})

people.mount(document.querySelector('#app')).update({
  title: 'People',
  people: ['Ada', 'Grace'],
})
```

One file can contain many templates. Load the file one time and select each
template from the loaded document.

## What the browser does

- The loaded document is inert. Scripts in the document do not run, and the
  browser does not load its images.
- The browser reads the character encoding from the response and from
  `<meta charset>`.
- The parser decodes character references such as `&amp;`.
- A page that enforces Trusted Types can use this recipe without a policy.
- Lumi copies the source into the page at each mount. Lumi does not change
  the loaded document.

## Why not `fetch()` and `DOMParser`

`fetch()` with `DOMParser` gives the same document for most files, but it has
two limits:

- `response.text()` always decodes the bytes as UTF-8. A file in a different
  encoding gives incorrect characters.
- `DOMParser.parseFromString()` is a Trusted Types sink. A page with
  `require-trusted-types-for 'script'` must supply a policy for it.

## Trust

Load source files only from an origin that you trust. A `<script>` element in
a component source runs when the component mounts. This is the same as for a
`<template>` in the page.
