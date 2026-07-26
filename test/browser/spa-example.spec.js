// @ts-check

import { expect, test } from '@playwright/test'

test('the SPA example drives its behavior through Lumi event bindings', async ({
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

  await page.goto('/examples/spa/index.html#/overview')

  const shell = page.locator('#shell')
  await expect(shell).toBeVisible()

  // header: menu toggle owns the shell's nav state through update()
  await page.locator('#menu').click()
  expect(problems).toEqual([])
  await expect(page.locator('#menu')).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(shell).toHaveClass(/nav-open/)

  // app shell: the backdrop closes it again
  await page.locator('#backdrop').click()
  await expect(shell).not.toHaveClass(/nav-open/)

  // navigation: routing between pages, marking only the active link
  await page.locator('#navigation .link[href="#/projects"]').click()
  await expect(page.locator('#projects-title')).toBeVisible()
  await expect(
    page.locator('#navigation .link[href="#/projects"]'),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    page.locator('#navigation .link[href="#/overview"]'),
  ).not.toHaveAttribute('aria-current', 'page')

  // projects: filter buttons repeat rows and update the summary
  const summary = page.locator('#projects .project-toolbar .summary')
  const allText = await summary.textContent()
  await page.locator('[data-filter="planning"]').click()
  await expect(summary).not.toHaveText(String(allText))
  await expect(page.locator('[data-filter="planning"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // teams: a member link opens that member's profile
  await page.locator('#navigation .link[href="#/teams"]').click()
  await page.locator('.member-row .name').first().click()
  const profile = page.locator('#profile')
  await expect(profile).toBeVisible()
  await expect(page.locator('#directory')).toBeHidden()
  await expect(profile.locator('.email')).toHaveAttribute(
    'href',
    /^mailto:/,
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
