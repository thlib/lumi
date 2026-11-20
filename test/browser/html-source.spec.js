// @ts-check

import { expect, test } from '@playwright/test'

// This test keeps the recipe in docs/html-sources.md correct. Lumi has no
// code for this recipe: the browser loads and parses the HTML file.

test('a component source from a separate HTML file mounts with Trusted Types enforced', async ({
  page,
}) => {
  await page.goto('/test/browser/fixture.html?trusted-types')

  const result = await page.evaluate(async () => {
    const { component, repeat, text } = /** @type {typeof import('../../src/index.js')} */ (
      await import(String('/src/index.js'))
    )

    /**
     * @param {string} url
     * @returns {Promise<Document>}
     */
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

    const loaded = await loadDocument('/test/browser/html-source.fixture.html')
    const source = /** @type {HTMLTemplateElement | null} */ (
      loaded.querySelector('#people')
    )
    const root = /** @type {Element} */ (document.querySelector('#test-root'))
    const mounted = component({
      source,
      bindings: [
        text('.title', ({data}) => /** @type {{title: string}} */ (data).title),
        repeat(
          '.person',
          ({data}) => /** @type {{people: string[]}} */ (data).people,
          [text(':scope', ({item}) => /** @type {string} */ (item))],
        ),
      ],
    }).mount(root)

    mounted.update({ title: 'People', people: ['Ada', 'Grace'] })

    const missing = await loadDocument('/test/browser/no-such-file.html').then(
      () => 'resolved',
      (error) => /** @type {Error} */ (error).message,
    )

    return {
      title: root.querySelector('.title')?.textContent,
      people: [...root.querySelectorAll('.person')].map((el) => el.textContent),
      inLiveDocument: root.querySelector('section')?.ownerDocument === document,
      sourceUnchanged: source?.content.querySelector('.title')?.textContent === 'Title',
      scriptRan: Reflect.has(window, 'htmlSourceScriptRan'),
      missing,
    }
  })

  expect(result).toEqual({
    title: 'People',
    people: ['Ada', 'Grace'],
    inLiveDocument: true,
    sourceUnchanged: true,
    scriptRan: false,
    missing: 'Cannot load /test/browser/no-such-file.html: HTTP 404',
  })
})
