import { expect, test } from '@playwright/test'

test('owner setup, protected API access, logout, and login', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

  const health = await page.request.get('/api/health')
  expect(health.status()).toBe(200)

  await page.getByLabel('Username').fill('forge-owner')
  await page.getByLabel('Password').fill('forge-e2e-password')
  await page.getByRole('button', { name: 'Create owner account' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByText('Control plane ready. Add a project to begin.')).toBeVisible()

  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'forge_sid')
  expect(sessionCookie).toBeDefined()
  expect(sessionCookie?.httpOnly).toBe(true)
  expect(sessionCookie?.sameSite).toBe('Lax')
  expect(sessionCookie?.secure).toBe(false)

  const duplicateSetup = await page.request.post('/api/auth/setup', {
    data: { username: 'another-owner', password: 'another-long-password' },
  })
  expect(duplicateSetup.status()).toBe(409)

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

  const unauthorizedDashboard = await page.request.get('/api/dashboard', {
    headers: { 'X-Forge-Client': '1' },
  })
  expect(unauthorizedDashboard.status()).toBe(401)

  await page.getByLabel('Username').fill('forge-owner')
  await page.getByLabel('Password').fill('incorrect-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid username or password')

  await page.getByLabel('Password').fill('forge-e2e-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

  const authenticatedDashboard = await page.request.get('/api/dashboard', {
    headers: { 'X-Forge-Client': '1' },
  })
  expect(authenticatedDashboard.status()).toBe(200)
})