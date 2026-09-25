import { chromium, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'
const payload = Buffer.from(JSON.stringify({ uid: 'local_layout_test', email: 'layout@example.invalid', name: 'Layout Test', exp: Date.now() + 3600000 })).toString('base64url')
const token = `local.${payload}.${createHmac('sha256', 'quick-book-isolated-local-acceptance').update(payload).digest('base64url')}`
const browser = await chromium.launch()
try {
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844], ['small-mobile', 360, 640]]) {
    if (process.argv[2] && process.argv[2] !== name) continue
    const context = await browser.newContext({ viewport: { width, height } })
    await context.addCookies([{ name: 'img2x_session', value: token, domain: 'localhost', path: '/' }])
    const page = await context.newPage()
    await page.goto('http://localhost:3011/projects/__mobile_preview__?printReady=1', { timeout: 120000, waitUntil: 'domcontentloaded' })
    const workspace = page.getByTestId('generation-workspace')
    await expect(workspace).toBeVisible({ timeout: 90000 })
    for (const id of ['generation-progress', 'generation-preview']) {
      const rect = await page.getByTestId(id).boundingBox()
      if (!rect || rect.y < 0 || rect.y + rect.height > height) throw new Error(`${name}: ${id} outside viewport: ${JSON.stringify(rect)}`)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await expect(page.getByTestId('generation-preview').locator('img')).toBeVisible()
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="generation-preview"] img')].every(img => img.complete && img.naturalWidth > 0))
    await page.screenshot({ path: `../tmp/quick-e2e/generation-${name}.png` })
    const printButton = page.getByRole('link', { name: 'Download A3 PDF' })
    await expect(printButton).toBeVisible({ timeout: 30000 })
    const buttonRect = await printButton.boundingBox()
    if (!buttonRect || buttonRect.y + buttonRect.height > height) throw new Error(`${name}: print download needs scrolling`)
    await expect(printButton).toHaveAttribute('href', '/print-ready-test.pdf')
    await page.screenshot({ path: `../tmp/quick-e2e/print-ready-${name}.png` })

    console.log('PASS', name, 'progress and preview fit without page scrolling')
    await context.close()
  }
} finally { await browser.close() }
