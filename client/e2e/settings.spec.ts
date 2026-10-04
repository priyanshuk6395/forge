import { expect, test } from '@playwright/test'
import { apiCall, signIn } from './helpers'

test('AWS Moto connection, encrypted credential settings, and unconfigured GitHub state', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('http://127.0.0.1:5000')).toBeVisible()

  const initialSettings = await apiCall(page, 'GET', '/api/settings')
  expect(initialSettings.body.aws).toMatchObject({ configured: false, usingInstanceProfile: false })
  await expect(page.getByText('local endpoint')).toBeVisible()

  const githubRepos = await apiCall(page, 'GET', '/api/github/repos')
  expect(githubRepos.status).toBe(400)
  expect(githubRepos.body.error).toContain('GitHub is not connected')

  await page.getByRole('button', { name: 'Test EC2 connection' }).click()
  await expect(page.getByText(/AWS credentials were not found/)).toBeVisible()

  await page.getByLabel('Access key ID').fill('forge-e2e-key')
  await page.getByLabel('Secret access key').fill('forge-e2e-secret')
  await page.getByLabel('Region').fill('us-east-1')
  await page.getByRole('button', { name: 'Save credentials' }).click()
  await expect(page.getByText('AWS settings saved')).toBeVisible()

  const savedSettings = await apiCall(page, 'GET', '/api/settings')
  expect(savedSettings.status).toBe(200)
  expect(savedSettings.body.aws).toMatchObject({ configured: true, region: 'us-east-1' })
  expect(JSON.stringify(savedSettings.body)).not.toContain('forge-e2e-secret')

  await page.getByRole('button', { name: 'Test EC2 connection' }).click()
  await expect(page.getByText('Local EC2 API is reachable')).toBeVisible()

  await page.getByRole('button', { name: 'Audit log', exact: true }).click()
  const audit = await apiCall(page, 'GET', '/api/audit')
  expect(audit.body.events.map((event: { action: string }) => event.action)).toContain(
    'settings.aws.updated'
  )
})