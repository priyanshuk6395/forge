import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers'

const now = new Date().toISOString()

function emptyDashboard() {
  return {
    generatedAt: now,
    overall: 'unknown',
    components: {
      forge: 'healthy',
      application: 'unknown',
      server: 'unknown',
      deployment: 'unknown',
      agent: 'unknown',
      network: 'unknown',
      ssl: 'unknown',
      security: 'unknown',
    },
    projectCount: 0,
    serverCount: 2,
    applications: [],
    openIncidents: [],
    recentActivity: [],
  }
}

function legacyDashboard() {
  return {
    overall: 'unknown',
    components: emptyDashboard().components,
    serverCount: 1,
    openIncidents: [],
    recentActivity: [],
  }
}

function incidentDashboard() {
  return {
    generatedAt: now,
    overall: 'critical',
    components: {
      forge: 'healthy',
      application: 'critical',
      server: 'healthy',
      deployment: 'attention',
      agent: 'unknown',
      network: 'unknown',
      ssl: 'unknown',
      security: 'unknown',
    },
    projectCount: 1,
    serverCount: 1,
    applications: [{
      id: 'proj_status',
      name: 'Checkout API',
      repoFullName: 'forge-lab/checkout-api',
      branch: 'main',
      serverId: 'srv_e2e',
      port: 8080,
      hostPort: 8080,
      health: 'critical',
      healthError: 'Health check timed out',
      consecutiveFailures: 3,
      lastCheckedAt: now,
      lastDeployedAt: now,
      currentDeployment: {
        id: 'dep_failed',
        number: 8,
        status: 'failed',
        commitSha: 'a1b2c3d',
        startedAt: now,
        error: 'Health check timed out',
      },
      previousSuccessfulDeployment: { id: 'dep_previous', number: 7, commitSha: 'd4e5f6a' },
    }],
    openIncidents: [{
      id: 'inc_status',
      projectId: 'proj_status',
      startedAt: now,
      resolvedAt: null,
      status: 'open',
      cause: 'Health check timed out',
      restartAttempts: 0,
    }],
    recentActivity: [{ actor: 'forge-owner', action: 'deployment.failed', ts: now }],
  }
}

async function mockDashboard(page: Page, body: ReturnType<typeof emptyDashboard> | ReturnType<typeof incidentDashboard>) {
  await page.route('**/api/dashboard', (route) => route.fulfill({ json: body }))
}

test('partial status stays neutral and server health explains missing telemetry', async ({ page }) => {
  await mockDashboard(page, emptyDashboard())
  await signIn(page)

  await expect(page.getByRole('heading', { name: 'Status is partially known' })).toBeVisible()
  await expect(page.getByText('Connect an application to begin health checks.')).toBeVisible()
  await expect(page.getByText('Unknown means Forge does not collect that signal yet.')).toBeVisible()

  await page.getByRole('button', { name: 'Open health details for E2E Server' }).click()
  await expect(page.getByRole('heading', { name: 'E2E Server', exact: true })).toBeVisible()
  const setupChecks = page.getByRole('region', { name: 'Initialization checks' })
  await expect(setupChecks.getByText('Missing tools will be installed')).toBeVisible()
  await expect(setupChecks.locator('.setup-check-phase').nth(0).locator('[data-state="missing"]')).toHaveCount(2)
  await expect(setupChecks.getByText('All requirements ready')).toBeVisible()
  await expect(setupChecks.locator('.setup-check-phase').nth(1).locator('[data-state="ready"]')).toHaveCount(8)
  const cpu = page.locator('.telemetry-fact').filter({ hasText: 'CPU' })
  await expect(cpu).toContainText('Not reported')
  await expect(page.getByText('no host agent for resource or certificate telemetry')).toBeVisible()

  await page.getByRole('button', { name: 'Remove from Forge' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('does not stop or terminate the host')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
})

test('legacy dashboard payload shows missing application details without crashing', async ({ page }) => {
  await page.route('**/api/dashboard', (route) => route.fulfill({ json: legacyDashboard() }))
  await signIn(page)

  await expect(page.getByRole('heading', { name: 'Status is partially known' })).toBeVisible()
  await expect(page.getByText('Application details unavailable')).toBeVisible()
  await expect(page.getByText('The latest dashboard response omitted the project count and application details, so Forge cannot confirm whether workloads are deployed.')).toBeVisible()
  await expect(page.locator('.server-data-line').first()).toContainText('Applications unavailable')
  await expect(page.locator('.server-data-line').first()).toContainText('Release unavailable')
})

test('incident detail explains evidence, confirms rollback, and opens logs directly', async ({ page }) => {
  await mockDashboard(page, incidentDashboard())
  await page.route('**/api/projects/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (route.request().method() === 'GET' && pathname === '/api/projects/proj_status/secrets') {
      await route.fulfill({ json: { keys: [] } })
      return
    }
    if (route.request().method() === 'GET' && pathname === '/api/projects/proj_status/logs') {
      await route.fulfill({ json: { logs: 'Health check timed out at /health' } })
      return
    }
    if (route.request().method() === 'GET' && pathname === '/api/projects/proj_status') {
      await route.fulfill({
        json: {
          project: {
            id: 'proj_status',
            name: 'Checkout API',
            repoFullName: 'forge-lab/checkout-api',
            branch: 'main',
            port: 8080,
            hostPort: 8080,
            healthPath: '/health',
            serverId: 'srv_e2e',
            health: 'critical',
            lastDeployedAt: now,
            autoDeploy: false,
            autoHeal: false,
            currentDeploymentId: 'dep_failed',
          },
          deployments: [{ id: 'dep_failed', number: 8, status: 'failed', commitSha: 'a1b2c3d', trigger: 'manual', startedAt: now, error: 'Health check timed out' }],
        },
      })
      return
    }
    await route.continue()
  })

  await signIn(page)
  await page.locator('.incident-summary-row').filter({ hasText: 'Checkout API' }).click()
  await expect(page.getByRole('heading', { name: 'Checkout API is unhealthy' })).toBeVisible()
  await expect(page.getByText('Health-check failures', { exact: true })).toBeVisible()
  await expect(page.getByText('Rollback to release #7')).toBeVisible()

  await page.getByRole('button', { name: 'Rollback' }).click()
  const confirmation = page.getByRole('dialog')
  await expect(confirmation).toContainText('The current version may be interrupted')
  await confirmation.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'View logs' }).click()
  await expect(page.getByRole('tab', { name: 'Logs' })).toHaveAttribute('data-state', 'active')
  await expect(page.getByText('Health check timed out at /health')).toBeVisible()
})

test('activity filters show only events in the selected category', async ({ page }) => {
  await mockDashboard(page, emptyDashboard())
  await page.route('**/api/audit', (route) => route.fulfill({
    json: {
      events: [
        { ts: now, actor: 'forge-owner', action: 'deployment.succeeded', result: 'success' },
        { ts: now, actor: 'forge-owner', action: 'server.connected', result: 'success' },
        { ts: now, actor: 'forge-owner', action: 'security.key_rotated', result: 'success' },
      ],
    },
  }))
  await signIn(page)
  await page.getByRole('button', { name: 'Activity', exact: true }).click()

  await page.getByRole('button', { name: 'Deployments' }).click()
  await expect(page.getByText('deployment · succeeded')).toBeVisible()
  await expect(page.getByText('server · connected')).toHaveCount(0)

  await page.getByRole('button', { name: 'Security' }).click()
  await expect(page.getByText('security · key rotated')).toBeVisible()
  await expect(page.getByText('deployment · succeeded')).toHaveCount(0)
})

test('mobile server inventory uses cards and keeps health details reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockDashboard(page, emptyDashboard())
  await signIn(page)

  await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await page.getByRole('button', { name: 'Servers', exact: true }).click()
  await expect(page.locator('.server-responsive-cards')).toBeVisible()
  await expect(page.locator('.server-table-view')).toBeHidden()
  await page.locator('.server-list-card').filter({ hasText: 'E2E Server' }).getByRole('button', { name: 'Health details' }).click()
  await expect(page.getByRole('heading', { name: 'E2E Server', exact: true })).toBeVisible()
  const setupChecks = page.getByRole('region', { name: 'Initialization checks' })
  await expect(setupChecks).toBeVisible()
  const setupColumns = await setupChecks.locator('.setup-checks-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns)
  expect(setupColumns.trim().split(/\s+/)).toHaveLength(1)
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(pageWidth).toBeLessThanOrEqual(390)
})

test('unknown project health is not normalized to attention', async ({ page }) => {
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      json: {
        projects: [{
          id: 'proj_unknown',
          name: 'Unobserved app',
          repoFullName: 'forge-lab/unobserved-app',
          branch: 'main',
          port: 8080,
          hostPort: 8080,
          healthPath: '/health',
          serverId: 'srv_e2e',
          health: { state: 'unknown' },
          lastDeployedAt: null,
          autoDeploy: false,
          autoHeal: false,
        }],
      },
    })
  })
  await mockDashboard(page, emptyDashboard())
  await signIn(page)
  await page.getByRole('button', { name: 'Projects', exact: true }).click()

  const row = page.getByRole('row', { name: /Unobserved app/ })
  await expect(row.getByText('Unknown', { exact: true })).toBeVisible()
  await expect(row.getByText('Attention', { exact: true })).toHaveCount(0)
})

test('failed status refresh identifies the snapshot as stale and keeps retry available', async ({ page }) => {
  let dashboardRequests = 0
  await page.route('**/api/dashboard', async (route) => {
    dashboardRequests += 1
    if (dashboardRequests === 1) {
      await route.fulfill({ json: emptyDashboard() })
      return
    }
    await route.fulfill({ status: 503, json: { error: 'Status service unavailable' } })
  })
  await signIn(page)
  await page.getByRole('button', { name: 'Refresh status' }).click()

  const staleNotice = page.getByRole('status').filter({ hasText: 'Showing the last successful snapshot' })
  await expect(staleNotice).toContainText('Status service unavailable')
  await staleNotice.getByRole('button', { name: 'Retry' }).click()
  await expect(staleNotice).toBeVisible()
  expect(dashboardRequests).toBeGreaterThanOrEqual(2)
})