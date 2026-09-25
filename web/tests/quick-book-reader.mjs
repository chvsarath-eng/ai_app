// Verify the existing 3D flipbook with A4 pages.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(pathToFileURL(process.argv[2]).href)
  await page.waitForFunction(() => !document.querySelector('#app').classList.contains('is-loading'))
  assert.equal(await page.locator('.sheet').count(), 12)
  assert.equal(await page.locator('.sheet img').count(), 24)
  const ratio = await page.locator('#book').evaluate(e => e.offsetWidth / 2 / e.offsetHeight)
  assert.ok(Math.abs(ratio - 210 / 297) < 0.01)
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => document.querySelectorAll('.sheet.flipped').length === 1)
  await page.waitForTimeout(1200)
  assert.equal(await page.locator('#book').evaluate(e => e.classList.contains('opened')), true)
  if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}/restored-desktop.png` })
  await page.keyboard.press('End')
  assert.equal(await page.locator('.sheet.flipped').count(), 12)
  await page.keyboard.press('Home')
  assert.equal(await page.locator('.sheet.flipped').count(), 0)
  await page.setViewportSize({ width: 844, height: 390 })
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1200)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}/restored-mobile.png` })
  assert.deepEqual(errors, [])
  console.log('Original flipbook: A4 proportions, 24 pages, page turns, final page, mobile and desktop passed')
} finally {
  await browser.close()
}
