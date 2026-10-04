import { expect, type Page } from '@playwright/test'

export async function signIn(page: Page) {
  await page.goto('/')

  const setupHeading = page.getByRole('heading', { name: 'Create your account' })
  if (await setupHeading.isVisible()) {
    await page.getByLabel('Username').fill('forge-owner')
    await page.getByLabel('Password').fill('forge-e2e-password')
    await page.getByRole('button', { name: 'Create owner account' }).click()
  } else {
    await page.getByLabel('Username').fill('forge-owner')
    await page.getByLabel('Password').fill('forge-e2e-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
}

export async function mockGitHub(page: Page) {
  await page.route('**/api/github/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname

    if (pathname === '/api/github/repos') {
      await route.fulfill({
        json: {
          repos: [
            {
              fullName: 'forge-lab/sample-app',
              private: false,
              defaultBranch: 'main',
              language: 'TypeScript',
            },
          ],
        },
      })
      return
    }

    if (pathname.endsWith('/branches')) {
      await route.fulfill({ json: { branches: ['main', 'develop'] } })
      return
    }

    if (pathname.endsWith('/detect')) {
      await route.fulfill({
        json: { language: 'TypeScript', hasDockerfile: true, hasCompose: false, defaultBranch: 'main' },
      })
      return
    }

    await route.continue()
  })
}

export async function apiCall(
  page: Page,
  method: string,
  url: string,
  body?: Record<string, unknown>
) {
  return page.evaluate(async ({ method, url, body }) => {
    const headers: Record<string, string> = { 'X-Forge-Client': '1' }
    const options: RequestInit = { method, headers }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    }
  }, { method, url, body })
}