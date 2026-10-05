export type HealthState = 'healthy' | 'attention' | 'critical' | 'unknown'
export type SystemState = HealthState

export interface IncidentSummary {
  id: string
  projectId: string
  startedAt: string
  resolvedAt: string | null
  status: 'open' | 'resolved'
  cause?: string | null
  restartAttempts: number
}

export interface ApplicationStatus {
  id: string
  name: string
  repoFullName: string
  branch: string
  serverId: string | null
  port: number
  hostPort: number
  health: HealthState
  healthError: string | null
  consecutiveFailures: number
  lastCheckedAt: string | null
  lastDeployedAt: string | null
  currentDeployment: Pick<Deployment, 'id' | 'number' | 'status' | 'commitSha' | 'startedAt' | 'error'> | null
  previousSuccessfulDeployment: Pick<Deployment, 'id' | 'number' | 'commitSha'> | null
}

export interface DashboardData {
  generatedAt: string
  overall: HealthState
  components: Partial<Record<'forge' | 'application' | 'server' | 'security' | 'network' | 'ssl' | 'agent' | 'deployment', HealthState>>
  projectCount: number
  projectCountAvailable?: boolean
  serverCount: number
  applications: ApplicationStatus[]
  applicationDetailsAvailable?: boolean
  openIncidents: IncidentSummary[]
  recentActivity: ActivityEntry[]
}

export interface ActivityEntry {
  actor: string
  action: string
  ts: string
}

export interface Project {
  id: string
  name: string
  repoFullName: string
  branch: string
  port: number
  hostPort: number
  healthPath: string
  serverId: string | null
  health: HealthState
  lastDeployedAt: string | null
  autoDeploy: boolean
  autoHeal: boolean
}

export interface ProjectDetail {
  project: Project & {
    currentDeployment: Deployment | null
    deployments: Deployment[]
    secrets: { keys: string[] }
  }
}

export interface Deployment {
  id: string
  number: number
  status: 'building' | 'success' | 'failed' | 'blocked'
  commitSha: string | null
  trigger: 'github' | 'manual'
  startedAt: string
  error?: string
  imageTag?: string
}

export interface Server {
  id: string
  name: string
  host: string
  sshUser?: string
  sshPort?: number
  provider: 'ec2' | 'existing'
  status: 'ready' | 'connecting' | 'provisioning' | 'bootstrap_failed'
  hasKey: boolean
  statusError?: string
  instanceId?: string
  region?: string
  setupChecks?: ServerSetupChecks
  agent?: ServerTelemetryAgent
  telemetry?: ServerTelemetry
}

export interface ServerTelemetryAgent {
  state: 'ready' | 'stale' | 'error'
  installedAt?: string
  lastSeenAt?: string
  lastError?: string
}

export interface ServerTelemetry {
  checkedAt: string
  checkedEpoch: number | null
  collector: 'ssh' | 'agent'
  cpuPercent: number | null
  cpuCores: number | null
  loadAverage: {
    one: number | null
    five: number | null
    fifteen: number | null
  }
  uptimeSeconds: number | null
  platform: string | null
  memory: {
    usedBytes: number | null
    totalBytes: number | null
    percent: number | null
  }
  disk: {
    usedBytes: number | null
    totalBytes: number | null
    percent: number | null
  }
  network: {
    receivedBytes: number | null
    sentBytes: number | null
    interfaces: number | null
    receivedBytesPerSecond: number | null
    sentBytesPerSecond: number | null
  }
  tls: {
    state: 'valid' | 'expired' | 'untrusted' | 'unavailable'
    expiresAt?: string
  }
}

export interface ServerRequirementCheck {
  id: string
  label: string
  state: 'ready' | 'missing' | 'unsupported'
}

export interface ServerRequirementReport {
  checkedAt: string
  platform: string
  canInitialize: boolean
  ready: boolean
  checks: ServerRequirementCheck[]
}

export interface ServerSetupChecks {
  preInit: ServerRequirementReport
  postInit: ServerRequirementReport
}

export interface GitHubSettings {
  connected: boolean
  login: string | null
}

export interface AWSSettings {
  usingInstanceProfile: boolean
  configured: boolean
  region: string
  endpoint: string | null
}

export interface SettingsData {
  github: GitHubSettings
  aws: AWSSettings
}

export interface AuditEvent {
  ts: string
  actor: string
  action: string
  result: 'success' | 'danger'
}

export interface NewProjectForm {
  name: string
  repoFullName: string
  repoPrivate: boolean
  branch: string
  port: number
  hostPort: number
  healthPath: string
  serverId: string
  autoHeal: boolean
}

export interface GitHubRepo {
  fullName: string
  private: boolean
  defaultBranch: string
}

export interface GitHubBranch {
  name: string
}

export interface GitHubDetect {
  hasDockerfile: boolean
  language?: string
}

export interface ConnectServerForm {
  name: string
  host: string
  sshUser: string
  sshPort: number
  privateKey: string
  keyPassphrase?: string
}

export interface ProvisionServerForm {
  name: string
  instanceType: string
  sshCidr: string
}

export interface SecretForm {
  key: string
  value: string
}

export interface ProjectSettingsForm {
  branch: string
  serverId: string
  port: number
  hostPort: number
  healthPath: string
  autoHeal: boolean
}