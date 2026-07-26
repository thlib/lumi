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

  const shell = page.locator('.app-shell')
  await expect(shell).toBeVisible()

  // header: menu toggle owns the shell's nav state through update()
  await page.locator('[data-menu-toggle]').click()
  await expect(shell).toHaveClass(/nav-open/)
  await expect(page.locator('[data-menu-toggle]')).toHaveAttribute(
    'aria-expanded',
    'true',
  )

  // app shell: the backdrop closes it again
  await page.locator('[data-action="close-nav"]').click()
  await expect(shell).not.toHaveClass(/nav-open/)

  // navigation: routing between pages
  await page.locator('[data-route="projects"]').click()
  await expect(page.locator('#projects-title')).toBeVisible()

  // projects: filter buttons repeat rows and update the summary
  const summary = page.locator('[data-bind="$.summary"]').first()
  const allText = await summary.textContent()
  await page.locator('[data-filter="planning"]').click()
  await expect(summary).not.toHaveText(String(allText))
  await expect(page.locator('[data-filter="planning"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // teams: submit validation, toast creation, and toast dismissal
  await page.locator('[data-route="teams"]').click()
  const inviteForm = page.locator('[data-invite-form]')
  await expect(inviteForm).toBeVisible()

  await inviteForm.locator('button[type="submit"]').click()
  await expect(page.locator('[data-invite-email]')).toHaveAttribute(
    'aria-invalid',
    'true',
  )

  await page.locator('[data-invite-email]').fill('person@example.com')
  await expect(page.locator('[data-invite-email]')).not.toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await inviteForm.locator('button[type="submit"]').click()

  const toast = page.locator('[data-demo-toast]').first()
  await expect(toast).toBeVisible()
  await toast.click()
  await expect(page.locator('[data-demo-toast]')).toHaveCount(0)

  expect(problems).toEqual([])
})
