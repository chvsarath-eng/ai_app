import { expect, test } from '@playwright/test'

const publicPages = [
  { path: '/', title: /img2x/i },
  { path: '/pricing', title: /Pricing/i },
  { path: '/gallery', title: /Gallery/i },
  { path: '/login', title: /Sign in/i },
  { path: '/create', title: /Storybook/i },
  { path: '/checkout', title: /img2x/i },
  { path: '/coming-soon', title: /Coming Soon/i },
  { path: '/terms', title: /Terms/i },
  { path: '/privacy', title: /Privacy/i },
  { path: '/refund', title: /Refund/i }
]

test.describe('public pages load', () => {
  for (const pageDef of publicPages) {
    test(`${pageDef.path} renders`, async ({ page }) => {
      const response = await page.goto(pageDef.path, { waitUntil: 'domcontentloaded' })
      expect(response?.ok() || response?.status() === 304).toBeTruthy()
      await expect(page).toHaveTitle(pageDef.title)
      await expect(page.getByRole('banner')).toBeVisible()
    })
  }
})

test.describe('naming and empty states', () => {
  test('login uses storybook wording', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByText(/storybooks/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue with email' }).click()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  })

  test('checkout empty state sends user to create', async ({ page }) => {
    await page.goto('/checkout')
    await expect(page.getByRole('heading', { name: /No storybook selected/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Create your storybook/i })).toBeVisible()
  })

  test('projects shows the library or a sign-in gate', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/(projects|login)/)
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /My Storybooks|Welcome back/i })
    ).toBeVisible()
  })

  test('create page asks for a photo before submit', async ({ page }) => {
    await page.goto('/create')
    await expect(page.getByRole('heading', { name: /Create your/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate' })).toBeDisabled()
    await expect(page.getByText('Add a photo to continue')).toBeVisible()
  })
})

test.describe('navigation', () => {
  test('header branding and primary links', async ({ page, isMobile }) => {
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('link', { name: 'img2x' })).toBeVisible()

    if (isMobile) {
      await page.getByRole('button', { name: 'Toggle navigation menu' }).click()
      await expect(page.getByRole('link', { name: 'Gallery' }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Pricing' }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Reviews' }).first()).toBeVisible()
      await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible()
    } else {
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Gallery' })).toBeVisible()
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Pricing' })).toBeVisible()
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Reviews' })).toBeVisible()
    }
  })

  test('gallery CTA uses storybook wording', async ({ page }) => {
    await page.goto('/gallery')
    await expect(page.getByRole('link', { name: /Create your own storybook/i })).toBeVisible()
  })
})
