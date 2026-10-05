import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { apiCall, mockGitHub, signIn } from './helpers'

test('GitHub loading failures use a dismissible toast without an uncaught page error', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/api/github/repos', (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'GitHub is not connected. Add a personal access token in Settings.' }),
  }))

  await signIn(page)
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await page.getByRole('button', { name: 'New project' }).first().click()

  const notification = page.getByRole('alert').filter({ hasText: 'GitHub is not connected.' })
  await expect(notification).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(pageErrors).toEqual([])
  await notification.getByRole('button', { name: 'Dismiss notification' }).click()
  await expect(notification).toHaveCount(0)
})

test('create project, protect secrets, update settings, and record audit events', async ({ page }, testInfo) => {
  await mockGitHub(page)
  await signIn(page)

  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await page.getByRole('button', { name: 'New project' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('select').nth(0).selectOption('forge-lab/sample-app')
  await dialog.locator('select').nth(1).selectOption('main')
  await expect(dialog.getByText('Dockerfile found')).toBeVisible()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.locator('select').selectOption('srv_e2e')
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect(page.getByText('Project created')).toBeVisible()
  const projectRow = page.getByRole('row', { name: /sample-app/ })
  await expect(projectRow).toBeVisible()
  await projectRow.click()
  await expect(page.getByRole('heading', { name: 'sample-app' })).toBeVisible()

  await page.getByRole('tab', { name: 'Secrets' }).click()
  await page.getByPlaceholder('DATABASE_URL').fill('DATABASE_URL')
  await page.getByPlaceholder('value').fill('postgres://e2e:only-in-temp@localhost/test')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/DATABASE_URL =/)).toBeVisible()

  const list = await apiCall(page, 'GET', '/api/projects')
  expect(list.status).toBe(200)
  const project = list.body.projects[0]
  expect(project.envKeys).toContain('DATABASE_URL')
  expect(project).not.toHaveProperty('envVarsEnc')

  const publicSecrets = await apiCall(page, 'GET', `/api/projects/${project.id}/secrets`)
  expect(publicSecrets.body).toEqual({ keys: ['DATABASE_URL'] })

  const dataDir = testInfo.config.metadata.forgeE2eDataDir as string
  const storedData = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'))
  const storedProject = storedData.projects.find((item: { id: string }) => item.id === project.id)
  expect(storedProject.envVarsEnc.DATABASE_URL).not.toBe('postgres://e2e:only-in-temp@localhost/test')
  expect(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8')).not.toContain(
    'postgres://e2e:only-in-temp@localhost/test'
  )

  const update = await apiCall(page, 'PATCH', `/api/projects/${project.id}`, {
    branch: 'develop',
    healthPath: '/status',
  })
  expect(update.status).toBe(200)
  expect(update.body.project).toMatchObject({ branch: 'develop', healthPath: '/status' })

  const unconfirmedDelete = await apiCall(page, 'DELETE', `/api/projects/${project.id}`, {})
  expect(unconfirmedDelete.status).toBe(400)
  expect(unconfirmedDelete.body.error).toContain('confirm: true')

  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  const audit = await apiCall(page, 'GET', '/api/audit')
  expect(audit.status).toBe(200)
  expect(audit.body.events.map((event: { action: string }) => event.action)).toEqual(
    expect.arrayContaining(['project.created', 'project.secrets.set', 'project.updated'])
  )

  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await page.getByRole('row', { name: /sample-app/ }).click()
  await page.getByRole('tab', { name: 'Secrets' }).click()
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText(/DATABASE_URL =/)).toHaveCount(0)

  const removedSecrets = await apiCall(page, 'GET', `/api/projects/${project.id}/secrets`)
  expect(removedSecrets.body).toEqual({ keys: [] })

  let deploymentNumber = 0
  let projectDetailReads = 0
  await page.route('**/api/projects/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const deployPath = `/api/projects/${project.id}/deploy`
    const detailPath = `/api/projects/${project.id}`

    if (route.request().method() === 'POST' && pathname === deployPath) {
      deploymentNumber += 1
      projectDetailReads = 0
      const deploymentId = `dep_e2e_${deploymentNumber}`
      await route.fulfill({
        status: 202,
        json: { deployment: { id: deploymentId, number: deploymentNumber, status: 'building', trigger: 'manual', startedAt: new Date().toISOString() } },
      })
      return
    }

    if (route.request().method() === 'GET' && pathname === detailPath && deploymentNumber > 0) {
      const response = await route.fetch()
      const detail = await response.json()
      const status = projectDetailReads++ === 0 ? 'building' : deploymentNumber === 1 ? 'failed' : 'success'
      const deploymentId = `dep_e2e_${deploymentNumber}`
      detail.project.currentDeploymentId = deploymentId
      detail.deployments = [{
        id: deploymentId,
        number: deploymentNumber,
        status,
        trigger: 'manual',
        startedAt: new Date().toISOString(),
        error: status === 'failed' ? 'SSH key rejected by the target server' : null,
      }]
      await route.fulfill({ response, json: detail })
      return
    }

    await route.continue()
  })

  await page.getByRole('tab', { name: 'Releases' }).click()
  await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  await expect(page.getByText('Deployment queued. Progress is in Releases.')).toBeVisible()
  await expect(page.locator('.release-progress')).toContainText('Build and health checks are running')
  await expect(page.getByRole('alert').filter({ hasText: 'SSH key rejected by the target server' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  await expect(page.locator('.release-progress')).toContainText('Build and health checks are running')
  await expect(page.getByRole('button', { name: 'Deploy', exact: true })).toBeDisabled()
  const successfulRelease = page.getByRole('row').filter({ hasText: '#2' })
  await expect(successfulRelease.getByText('success', { exact: true })).toBeVisible({ timeout: 10_000 })
})