// @ts-check

import { expect, test } from '@playwright/test'

for (const framework of ['vue', 'react', 'lit', 'angular']) {
  test(`the ${framework} SPA opens from its shared examples path`, async ({
    page,
  }) => {
    /** @type {string[]} */
    const problems = []
    page.on('pageerror', error => problems.push(String(error)))
    page.on('console', message => {
      if (message.type() === 'error') {
        problems.push(message.text())
      }
    })

    await page.goto(`/examples/spa/${framework}/index.html`)

    await expect(page.locator('main h1')).toBeVisible()
    await expect(
      page.locator('.project-card .accent').first(),
    ).toHaveAttribute('data-project', 'atlas')
    await expect(
      page.locator('.project-card .bar').first(),
    ).toHaveAttribute('data-project', 'atlas')
    await expect(page.locator('[style]')).toHaveCount(0)
    expect(problems).toEqual([])
  })
}

for (const variant of ['lumi-native', 'lumi-build', 'lumi-ts', 'lumi-dsl']) {
  test(`the ${variant} SPA starts from its intended output`, async ({page}) => {
    /** @type {string[]} */
    const problems = []
    page.on('pageerror', error => problems.push(String(error)))
    page.on('console', message => {
      if (message.type() === 'error') {
        problems.push(message.text())
      }
    })

    const output = variant === 'lumi-native' ? '' : '/dist'
    await page.goto(`/examples/spa/${variant}${output}/index.html#/overview`)

    await expect(page.locator('#overview-title')).toBeVisible()
    await expect(
      page.locator('.project-card .accent').first(),
    ).toHaveAttribute('data-project', 'atlas')
    await expect(
      page.locator('.project-card .bar').first(),
    ).toHaveAttribute('data-project', 'atlas')
    await expect(page.locator('[style]')).toHaveCount(0)
    expect(problems).toEqual([])
  })
}

for (const variant of ['lumi-build', 'lumi-ts', 'lumi-dsl']) {
  test(`the ${variant} SPA drives behavior through Lumi bindings`, async ({
    page,
  }) => {
    /** @type {string[]} */
    const problems = []
    page.on('pageerror', error => problems.push(String(error)))
    page.on('console', message => {
      if (message.type() === 'error') {
        problems.push(message.text())
      }
    })

    await page.setViewportSize({width: 800, height: 900})
    await page.goto(`/examples/spa/${variant}/index.html#/overview`)
    await expect(page).toHaveURL(
      new RegExp(
        `/examples/spa/${variant}/dist/index\\.html#/overview$`,
      ),
    )

    const shell = page.locator('#shell')
    await expect(shell).toBeVisible()

    // header: menu toggle owns the shell's nav state through update()
    await page.locator('#menu').click()
    expect(problems).toEqual([])
    await expect(page.locator('#menu')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(shell).toHaveAttribute('data-navigation-state', 'open')

    // app shell: the backdrop closes it again
    await page.locator('#backdrop').click()
    await expect(shell).not.toHaveAttribute('data-navigation-state', 'open')

    // navigation: routing between pages, marking only the active link
    await page.locator('#menu').click()
    await page.locator('#navigation .link[href="#/projects"]').click()
    await expect(page.locator('#projects-title')).toBeVisible()
    await expect(
      page.locator('#navigation .link[href="#/projects"]'),
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      page.locator('#navigation .link[href="#/overview"]'),
    ).not.toHaveAttribute('aria-current', 'page')

    await expect(
      page.locator('#projects .project-card .accent').first(),
    ).toHaveAttribute('data-project', 'atlas')
    await expect(
      page.locator('#projects .project-card .bar').first(),
    ).toHaveAttribute('data-project', 'atlas')
    await expect(page.locator('[style]')).toHaveCount(0)

    // projects: filter buttons repeat rows and update the summary
    const summary = page.locator('#projects .project-toolbar .summary')
    const planningFilter = page.locator(
      variant === 'lumi-dsl'
        ? '[data-project-filter="planning"]'
        : '[data-filter="planning"]',
    )
    const allText = await summary.textContent()
    await planningFilter.click()
    await expect(summary).not.toHaveText(String(allText))
    await expect(planningFilter).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // records: the large example renders and filters the complete 20k dataset
    await page.locator('#menu').click()
    await page.locator('#navigation .link[href="#/records"]').click()
    await expect(page.locator('#records-title')).toBeVisible()
    await expect(page.locator('.record-row')).toHaveCount(20_000)
    await page.locator('[data-record-filter="alpha"]').click()
    await expect(page.locator('[data-record-filter="alpha"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('.record-row')).toHaveCount(5_000)
    await expect(page.locator('.record-row').first()).toContainText('record-00001')
    await page.locator('[data-record-sort]').click()
    await expect(page.locator('[data-record-header]')).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await expect(page.locator('.record-row').first()).toContainText('record-19997')

    // teams: a member link opens that member's profile
    await page.locator('#menu').click()
    await page.locator('#navigation .link[href="#/teams"]').click()
    await page.locator('.member-row .name').first().click()
    const profile = page.locator('#profile')
    await expect(profile).toBeVisible()
    await expect(page.locator('#directory')).toBeHidden()
    await expect(profile.locator('.email')).toHaveAttribute(
      'href',
      /^mailto:/,
    )
    await expect(profile.locator('.avatar')).toHaveAttribute(
      'data-person',
      'aida-loveleys',
    )

    // teams: submit validation, toast creation, and toast dismissal
    await profile.locator('.back-link').click()
    const inviteForm = page.locator('.invite')
    await expect(inviteForm).toBeVisible()

    await inviteForm.locator('button[type="submit"]').click()
    await expect(page.locator('.invite input[type="email"]')).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    await page.locator('.invite input[type="email"]').fill('person@example.com')
    await expect(page.locator('.invite input[type="email"]')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await inviteForm.locator('button[type="submit"]').click()

    const toast = page.locator('.toast').first()
    await expect(toast).toBeVisible()
    await toast.click()
    await expect(page.locator('.toast')).toHaveCount(0)

    expect(problems).toEqual([])
  })
}
