import { expect, test } from '@playwright/test'

test('Quick Book selection carries both deliverables into checkout', async ({ page }) => {
  await page.goto('/create')
  await expect(page.getByRole('radio', { name: /Quick Book/ })).toBeChecked()
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'reference.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64')
  })
  await page.getByPlaceholder('e.g. Ben').fill('Maya')
  await page.getByPlaceholder('e.g. 6').fill('7')
  await page.getByPlaceholder(/Who is the hero/).fill('Maya follows a glowing path through a moonlit forest.')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(page).toHaveURL(/\/checkout/)
  await expect(page.getByText('Quick Book · 24 A4 pages')).toBeVisible()
  await expect(page.getByText(/Includes an A3 print PDF/)).toBeVisible()
  await expect(page.getByText('Interactive digital flipbook')).toBeVisible()
  await expect(page.getByText('Instant email delivery')).toHaveCount(0)
  await expect(page.getByText('AI-generated 4K illustrations', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('Hardcover remains independently selectable', async ({ page }) => {
  await page.goto('/create')
  const hardcover = page.getByRole('radio', { name: /Hardcover/ })
  await page.locator('label').filter({ has: hardcover }).click()
  await expect(hardcover).toBeChecked()
  await expect(page.getByRole('radio', { name: /Quick Book/ })).not.toBeChecked()
})
