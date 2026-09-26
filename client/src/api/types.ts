export type HealthState = 'healthy' | 'attention' | 'critical'

export interface DashboardData {
  overall: HealthState
  components: {
    application: HealthState
    server: HealthState
    security: HealthState
    network: HealthState
    ssl: HealthState
    deployment: HealthState
  }
  projectCount: number
  serverCount: number
  openIncidents: number
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
  hostPort: number
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
  commitSha: string
  trigger: 'github' | 'manual'
  startedAt: string
  error?: string
  imageTag?: string
}

export interface Server {
  id: string
  name: string
  host: string
  provider: 'ec2' | 'existing'
  status: 'ready' | 'connecting' | 'provisioning' | 'bootstrap_failed'
  hasKey: boolean
}

export interface GitHubSettings {
  connected: boolean
  login: string | null
}

export interface AWSSettings {
  usingInstanceProfile: boolean
  configured: boolean
  region: string
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