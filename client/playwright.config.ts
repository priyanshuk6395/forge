import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-e2e-'))
const port = 3197

fs.writeFileSync(
  path.join(dataDir, 'db.json'),
  JSON.stringify({
    servers: [
      {
        id: 'srv_e2e',
        name: 'E2E Server',
        host: '127.0.0.1',
        sshUser: 'ubuntu',
        sshPort: 22,
        provider: 'existing',
        status: 'ready',
        setupChecks: {
          preInit: {
            checkedAt: new Date().toISOString(),
            platform: 'ubuntu',
            canInitialize: true,
            ready: false,
            checks: [
              { id: 'platform', label: 'Debian or Ubuntu', state: 'ready' },
              { id: 'privilege', label: 'Root or passwordless sudo', state: 'ready' },
              { id: 'apt-get', label: 'APT package manager', state: 'ready' },
              { id: 'systemd', label: 'systemd service manager', state: 'ready' },
              { id: 'docker', label: 'Docker Engine', state: 'missing' },
              { id: 'docker-daemon', label: 'Docker daemon', state: 'missing' },
              { id: 'git', label: 'Git', state: 'ready' },
              { id: 'curl', label: 'curl', state: 'ready' },
            ],
          },
          postInit: {
            checkedAt: new Date().toISOString(),
            platform: 'ubuntu',
            canInitialize: true,
            ready: true,
            checks: [
              { id: 'platform', label: 'Debian or Ubuntu', state: 'ready' },
              { id: 'privilege', label: 'Root or passwordless sudo', state: 'ready' },
              { id: 'apt-get', label: 'APT package manager', state: 'ready' },
              { id: 'systemd', label: 'systemd service manager', state: 'ready' },
              { id: 'docker', label: 'Docker Engine', state: 'ready' },
              { id: 'docker-daemon', label: 'Docker daemon', state: 'ready' },
              { id: 'git', label: 'Git', state: 'ready' },
              { id: 'curl', label: 'curl', state: 'ready' },
            ],
          },
        },
        sshKeyEnc: 'e2e-encrypted-private-key',
        sshKeyPassphraseEnc: 'e2e-encrypted-passphrase',
        sshPasswordEnc: 'e2e-encrypted-password',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'srv_moto_stuck',
        name: 'Stuck Moto server',
        host: '54.214.19.198',
        sshUser: 'ubuntu',
        sshPort: 22,
        provider: 'ec2',
        status: 'bootstrap_failed',
        statusError: 'Server did not finish bootstrapping in time. Last error: Timed out while waiting for handshake',
        instanceId: 'i-e2e-stuck',
        region: 'us-east-1',
        createdAt: new Date().toISOString(),
      },
    ],
  }),
  { mode: 0o600 }
)

process.once('exit', () => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // Test data is disposable; cleanup must not replace the test result.
  }
})

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  metadata: { forgeE2eDataDir: dataDir },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server/index.js',
    cwd: rootDir,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(port),
      DATA_DIR: dataDir,
      ENCRYPTION_KEY: '1'.repeat(64),
      SESSION_SECRET: 'forge-e2e-session-secret',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: '',
      AWS_SECRET_ACCESS_KEY: '',
      AWS_EC2_METADATA_DISABLED: 'true',
      FORGE_AWS_ENDPOINT_URL: 'http://127.0.0.1:5000',
      FORGE_AWS_AMI_ID: 'ami-12345678',
    },
  },
})