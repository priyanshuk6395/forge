import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { apiCall, mockGitHub, signIn } from './helpers'

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

  await page.getByRole('button', { name: 'Audit log', exact: true }).click()
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
})