// @ts-check

import {expect, test} from '@playwright/test'

for (const example of [
  {
    name: 'native bindings',
    path: '/examples/counter-native/index.html',
    repeated: 'li',
  },
  {
    name: 'JSONPath data-path',
    path: '/examples/counter/index.html',
    repeated: 'li',
  },
]) {
  test(`the ${example.name} counter updates and repeats items`, async ({page}) => {
    /** @type {string[]} */
    const problems = []
    page.on('pageerror', error => problems.push(String(error)))

    await page.goto(example.path)

    await expect(page.locator('output')).toHaveText('count is 0')
    await expect(page.locator(example.repeated)).toHaveCount(0)

    await page.getByRole('button', {name: 'Increment'}).click()
    await expect(page.locator('output')).toHaveText('count is 1')
    await expect(page.locator(example.repeated)).toHaveCount(1)
    await expect(page.locator('li')).toHaveText('Item 1')

    await page.getByRole('button', {name: 'Decrement'}).click()
    await expect(page.locator('output')).toHaveText('count is 0')
    await expect(page.locator(example.repeated)).toHaveCount(0)
    expect(problems).toEqual([])
  })
}
