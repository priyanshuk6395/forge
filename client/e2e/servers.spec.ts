import { expect, test } from '@playwright/test'
import { apiCall, signIn } from './helpers'

test('connecting an existing server waits and shows the SSH failure', async ({ page }) => {
  let requestBody: Record<string, unknown> | undefined

  await page.route('**/api/servers/connect', async (route) => {
    requestBody = route.request().postDataJSON()
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Could not connect over SSH: Connection refused' }),
    })
  })

  await signIn(page)
  await page.getByRole('button', { name: 'Servers', exact: true }).click()
  await page.getByRole('button', { name: 'Connect existing' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Staging host')
  await dialog.getByLabel('Host / IP').fill('192.0.2.10')
  await dialog.getByLabel('Upload private key PEM file').setInputFiles({
    name: 'staging.pem',
    mimeType: 'application/x-pem-file',
    buffer: Buffer.from('-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----'),
  })
  await expect(dialog.getByText('Selected staging.pem')).toBeVisible()
  await dialog.getByLabel('Key passphrase (if required)').fill('test-only-passphrase')
  await dialog.getByRole('button', { name: 'Connect' }).click()

  await expect(dialog.getByRole('status')).toContainText('Testing SSH')
  await expect(dialog.getByRole('button', { name: 'Connecting…' })).toBeDisabled()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('Connection refused')
  expect(requestBody).toMatchObject({
    name: 'Staging host',
    host: '192.0.2.10',
    privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----',
    keyPassphrase: 'test-only-passphrase',
  })
  await expect(page.getByText('Server connected and prepared')).toHaveCount(0)

  const publicServers = await apiCall(page, 'GET', '/api/servers')
  expect(publicServers.status).toBe(200)
  const publicServer = publicServers.body.servers.find((server: { id: string }) => server.id === 'srv_e2e')
  expect(publicServer).toMatchObject({ hasKey: true, hasPassword: true })
  expect(publicServer).not.toHaveProperty('sshKeyEnc')
  expect(publicServer).not.toHaveProperty('sshKeyPassphraseEnc')
  expect(publicServer).not.toHaveProperty('sshPasswordEnc')
})

test('provisioning waits and keeps AWS failures visible', async ({ page }) => {
  await page.route('**/api/servers/provision', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'AWS credentials are not configured' }),
    })
  })

  await signIn(page)
  await page.getByRole('button', { name: 'Servers', exact: true }).click()
  await page.getByRole('button', { name: 'Provision on AWS' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('E2E instance')
  await dialog.getByRole('button', { name: 'Provision', exact: true }).click()

  await expect(dialog.getByRole('status')).toContainText('Launching EC2')
  await expect(dialog.getByRole('button', { name: 'Provisioning…' })).toBeDisabled()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('AWS credentials are not configured')
  await expect(page.getByText('Server provisioning started')).toHaveCount(0)
})

test('SSH test and server removal report delayed failures instead of success', async ({ page }) => {
  await page.route('**/api/servers/*/test', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'SSH key rejected' }),
    })
  })
  await page.route('**/api/servers/srv_e2e', async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue()
    await new Promise((resolve) => setTimeout(resolve, 400))
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'This server is still used by a project' }),
    })
  })

  await signIn(page)
  await page.getByRole('button', { name: 'Servers', exact: true }).click()
  const row = page.getByRole('row').nth(1)
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: /Actions for/ }).click()
  await page.getByRole('menuitem', { name: 'Test SSH' }).click()
  await expect(row.getByRole('status')).toContainText('Testing SSH connection')
  await expect(row.getByRole('alert')).toContainText('SSH key rejected')

  await row.getByRole('button', { name: /Actions for/ }).click()
  await page.getByRole('menuitem', { name: 'Remove from Forge' }).click()
  const removeDialog = page.getByRole('dialog')
  await expect(removeDialog).toContainText('host will not be stopped or terminated')
  await removeDialog.getByRole('button', { name: 'Remove server' }).click()
  await expect(removeDialog.getByRole('button', { name: 'Removing…' })).toBeDisabled()
  await expect(removeDialog.getByRole('alert')).toContainText('still used by a project')
  await expect(page.getByText('Server deleted')).toHaveCount(0)
})

test('private key upload rejects non-key files', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Servers', exact: true }).click()
  await page.getByRole('button', { name: 'Connect existing' }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Recovery host')
  await dialog.getByLabel('Host / IP').fill('192.0.2.13')
  await dialog.getByLabel('Upload private key PEM file').setInputFiles({
    name: 'valid.pem',
    mimeType: 'application/x-pem-file',
    buffer: Buffer.from('-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----'),
  })
  await expect(dialog.getByLabel('Private key (PEM)')).not.toHaveValue('')
  await dialog.getByLabel('Upload private key PEM file').setInputFiles({
    name: 'not-a-key.pem',
    mimeType: 'application/x-pem-file',
    buffer: Buffer.from('this is not a private key'),
  })
  await expect(dialog.getByRole('alert')).toContainText('does not look like a PEM')
  await expect(dialog.getByLabel('Private key (PEM)')).toHaveValue('')
  await expect(dialog.getByRole('button', { name: 'Connect' })).toBeDisabled()
  await dialog.getByLabel('Private key (PEM)').fill('-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----')
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Connect' })).toBeEnabled()

  await dialog.getByLabel('Upload private key PEM file').setInputFiles({
    name: 'oversized.pem',
    mimeType: 'application/x-pem-file',
    buffer: Buffer.alloc(64 * 1024 + 1),
  })
  await expect(dialog.getByRole('alert')).toContainText('smaller than 64 KB')
  await expect(dialog.getByLabel('Private key (PEM)')).toHaveValue('')
  await expect(dialog.getByRole('button', { name: 'Connect' })).toBeDisabled()
})

test('Connect and Provision close only after their operations finish successfully', async ({ page }) => {
  await page.route('**/api/servers/connect', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await route.fulfill({
      json: {
        server: { id: 'srv_connected_mock', name: 'Ready host', host: '192.0.2.11', provider: 'existing', status: 'ready', hasKey: true },
      },
    })
  })
  await page.route('**/api/servers/provision', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350))
    await route.fulfill({
      json: {
        server: { id: 'srv_provisioned_mock', name: 'Ready EC2', host: '192.0.2.12', provider: 'ec2', status: 'ready', hasKey: true },
      },
    })
  })

  await signIn(page)
  await page.getByRole('button', { name: 'Servers', exact: true }).click()
  await page.getByRole('button', { name: 'Connect existing' }).first().click()

  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Ready host')
  await dialog.getByLabel('Host / IP').fill('192.0.2.11')
  await dialog.getByLabel('Private key (PEM)').fill('-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----')
  await dialog.getByRole('button', { name: 'Connect' }).click()
  await expect(dialog.getByRole('status')).toContainText('Testing SSH')
  await expect(dialog).toBeHidden()
  const connectedToast = page.getByRole('status').filter({ hasText: 'Server connected and prepared' })
  await expect(connectedToast).toBeVisible()

  await page.getByRole('button', { name: 'Provision on AWS' }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Ready EC2')
  await dialog.getByRole('button', { name: 'Provision', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Launching EC2')
  await expect(dialog).toBeHidden()
  const provisionedToast = page.getByRole('status').filter({ hasText: 'EC2 server is ready for deployments.' })
  await expect(provisionedToast).toBeVisible()
  await provisionedToast.waitFor({ state: 'detached', timeout: 6_500 })
})

test('successful SSH test and removal report completion after the server responds', async ({ page }) => {
  await page.route('**/api/servers/*/test', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350))
    await route.fulfill({ json: { ok: true, output: 'SSH connection established' } })
  })
  await page.route('**/api/servers/srv_e2e', async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue()
    await new Promise((resolve) => setTimeout(resolve, 350))
    await route.fulfill({ json: { ok: true } })
  })

  await signIn(page)
  await page.getByRole('button', { name: 'Servers', exact: true }).click()
  const row = page.getByRole('row').nth(1)
  await row.getByRole('button', { name: /Actions for/ }).click()
  await page.getByRole('menuitem', { name: 'Test SSH' }).click()
  await expect(row.getByRole('status')).toContainText('Testing SSH connection')
  await expect(row.getByRole('status')).toContainText('SSH connection verified.')

  await row.getByRole('button', { name: /Actions for/ }).click()
  await page.getByRole('menuitem', { name: 'Remove from Forge' }).click()
  const removeDialog = page.getByRole('dialog')
  await removeDialog.getByRole('button', { name: 'Remove server' }).click()
  await expect(removeDialog.getByRole('button', { name: 'Removing…' })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Server removed from Forge.' })).toBeVisible()
})