import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Cloud,
  ExternalLink,
  FileWarning,
  FolderGit2,
  RefreshCw,
  Server as ServerIcon,
  ShieldCheck,
  Wifi,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { timeAgo } from '@/lib/utils'
import type { ApplicationStatus, DashboardData, HealthState, IncidentSummary, Server } from '@/api/types'

const STATE_LABEL: Record<HealthState, string> = {
  healthy: 'Operational',
  attention: 'Attention required',
  critical: 'Critical',
  unknown: 'Partial data',
}

const STATE_ICON = {
  healthy: CheckCircle2,
  attention: AlertTriangle,
  critical: XCircle,
  unknown: CircleHelp,
} satisfies Record<HealthState, typeof CheckCircle2>

interface StatusCenterProps {
  data?: DashboardData
  servers: Server[]
  isLoading: boolean
  isRefreshing: boolean
  error?: Error | null
  onRetry: () => void
  onRefresh: () => void
  onOpenServer: (serverId: string) => void
  onOpenProject: (projectId: string) => void
  onOpenIncident: (incidentId: string) => void
  onOpenProjects: () => void
  onOpenServers: () => void
  onOpenActivity: () => void
}

export function StatusCenter({
  data,
  servers,
  isLoading,
  isRefreshing,
  error,
  onRetry,
  onRefresh,
  onOpenServer,
  onOpenProject,
  onOpenIncident,
  onOpenProjects,
  onOpenServers,
  onOpenActivity,
}: StatusCenterProps) {
  if (isLoading) return <StatusLoading />

  if (!data) {
    return (
      <section className="status-error-state" role="alert">
        <XCircle aria-hidden="true" />
        <div>
          <p className="status-eyebrow">CONTROL PLANE</p>
          <h1>Forge status is unavailable</h1>
          <p>{error?.message || 'Forge could not load the latest system state.'}</p>
          <Button variant="subtle" onClick={onRetry}>Retry connection</Button>
        </div>
      </section>
    )
  }

  const incidents = [...data.openIncidents].sort(
    (left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
  )
  const applications = Array.isArray(data.applications) ? data.applications : []
  const applicationDetailsAvailable = data.applicationDetailsAvailable !== false && Array.isArray(data.applications)
  const attentionServers = servers.filter((server) => getServerState(server, applications) !== 'healthy')
  const statusMessage = getOverallMessage(data, servers)
  const systems = [
    { label: 'Forge', state: data.components.forge ?? 'unknown', icon: Cloud },
    { label: 'Servers', state: data.components.server ?? 'unknown', icon: ServerIcon },
    { label: 'Applications', state: data.components.application ?? 'unknown', icon: FolderGit2 },
    { label: 'Deployments', state: data.components.deployment ?? 'unknown', icon: Activity },
    { label: 'Agents', state: data.components.agent ?? 'unknown', icon: Activity },
    { label: 'Network', state: data.components.network ?? 'unknown', icon: Wifi },
    { label: 'SSL / TLS', state: data.components.ssl ?? 'unknown', icon: ShieldCheck },
    { label: 'Security', state: data.components.security ?? 'unknown', icon: ShieldCheck },
  ] as const

  return (
    <div className="status-page">
      <header className="status-page-heading">
        <div>
          <p className="status-eyebrow">OPERATIONS / CONTROL PLANE</p>
          <h1>Status</h1>
          <p className="status-page-description">A live view of Forge, your servers, and deployed applications.</p>
        </div>
        <Button variant="subtle" size="sm" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh status">
          <RefreshCw className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
          {isRefreshing ? 'Refreshing' : 'Refresh'}
        </Button>
      </header>

      <section className={`status-hero state-${data.overall}`} aria-live="polite">
        <div className="status-hero-icon"><StatusIcon state={data.overall} /></div>
        <div className="status-hero-copy">
          <p className="status-eyebrow">FORGE SYSTEM STATUS</p>
          <h2>{getOverallLabel(data.overall)}</h2>
          <p>{statusMessage}</p>
        </div>
        <div className="status-hero-aside">
          <span className="status-updated"><Clock3 aria-hidden="true" /> Updated {timeAgo(data.generatedAt)}</span>
          <span>{incidents.length} open {incidents.length === 1 ? 'incident' : 'incidents'}</span>
        </div>
      </section>

      {error && (
        <div className="status-refresh-warning" role="status">
          <AlertTriangle aria-hidden="true" />
          <p>Some status data could not be refreshed. Showing the last successful snapshot: {error.message}</p>
          <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      )}

      {incidents.length > 0 && (
        <section className="status-section" aria-labelledby="priority-heading">
          <div className="status-section-heading">
            <div>
              <p className="status-eyebrow">ACTION REQUIRED</p>
              <h2 id="priority-heading">Active incidents</h2>
            </div>
            <span className="status-count critical-count">{incidents.length}</span>
          </div>
          <div className="incident-list">
            {incidents.map((incident) => (
              <IncidentSummaryRow
                key={incident.id}
                incident={incident}
                application={applications.find((item) => item.id === incident.projectId)}
                onOpen={() => onOpenIncident(incident.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="status-section" aria-labelledby="systems-heading">
        <div className="status-section-heading">
          <div>
            <p className="status-eyebrow">OBSERVABILITY</p>
            <h2 id="systems-heading">System signals</h2>
          </div>
          <p className="status-section-note">Signals use recent host telemetry. Install an agent in server details for scheduled reports.</p>
        </div>
        <div className="system-signal-grid">
          {systems.map(({ label, state, icon: Icon }) => (
            <div className="system-signal" key={label} data-state={state}>
              <span className="system-signal-icon"><Icon aria-hidden="true" /></span>
              <span className="system-signal-copy">
                <span className="system-signal-name">{label}</span>
                <SystemStateLabel state={state} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="status-section" aria-labelledby="servers-heading">
        <div className="status-section-heading">
          <div>
            <p className="status-eyebrow">INFRASTRUCTURE</p>
            <h2 id="servers-heading">Servers</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onOpenServers}>All servers <ArrowRight aria-hidden="true" /></Button>
        </div>
        {servers.length === 0 ? (
          <div className="status-empty-inline">
            <ServerIcon aria-hidden="true" />
            <div>
              <strong>No servers connected</strong>
              <p>Connect a Linux host to start monitoring application health.</p>
            </div>
            <Button variant="subtle" size="sm" onClick={onOpenServers}>Add a server</Button>
          </div>
        ) : (
          <div className="server-card-grid">
            {servers.map((server) => (
              <ServerSummaryCard
                key={server.id}
                server={server}
                applications={applications.filter((application) => application.serverId === server.id)}
                applicationDetailsAvailable={applicationDetailsAvailable}
                onOpen={() => onOpenServer(server.id)}
                onOpenProject={onOpenProject}
              />
            ))}
          </div>
        )}
        {attentionServers.length > 0 && servers.length > 0 && (
          <p className="status-inline-note">
            <AlertTriangle aria-hidden="true" /> {attentionServers.length} server{attentionServers.length === 1 ? '' : 's'} need review or have partial telemetry.
          </p>
        )}
      </section>

      <section className="status-section" aria-labelledby="applications-heading">
        <div className="status-section-heading">
          <div>
            <p className="status-eyebrow">WORKLOADS</p>
            <h2 id="applications-heading">Applications</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onOpenProjects}>All applications <ArrowRight aria-hidden="true" /></Button>
        </div>
        {!applicationDetailsAvailable && (data.projectCountAvailable !== true || data.projectCount > 0) ? (
          <div className="status-empty-inline">
            <CircleHelp aria-hidden="true" />
            <div>
              <strong>Application details unavailable</strong>
              <p>{data.projectCountAvailable
                ? `Forge reports ${data.projectCount} project${data.projectCount === 1 ? '' : 's'}, but health details are missing from the latest dashboard response.`
                : 'The latest dashboard response omitted the project count and application details, so Forge cannot confirm whether workloads are deployed.'}</p>
            </div>
            <Button variant="subtle" size="sm" onClick={onOpenProjects}>View applications</Button>
          </div>
        ) : applications.length === 0 ? (
          <div className="status-empty-inline">
            <FolderGit2 aria-hidden="true" />
            <div>
              <strong>No applications deployed</strong>
              <p>Create a project to track health checks and release status here.</p>
            </div>
            <Button variant="subtle" size="sm" onClick={onOpenProjects}>Create a project</Button>
          </div>
        ) : (
          <div className="application-status-list">
            {applications.map((application) => (
              <ApplicationSummaryRow
                key={application.id}
                application={application}
                server={servers.find((item) => item.id === application.serverId)}
                onOpen={() => onOpenProject(application.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="status-section" aria-labelledby="activity-heading">
        <div className="status-section-heading">
          <div>
            <p className="status-eyebrow">AUDIT TRAIL</p>
            <h2 id="activity-heading">Recent activity</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onOpenActivity}>All activity <ArrowRight aria-hidden="true" /></Button>
        </div>
        {data.recentActivity.length === 0 ? (
          <p className="status-empty-text">No activity recorded yet.</p>
        ) : (
          <ol className="status-activity-list">
            {data.recentActivity.slice(0, 6).map((entry, index) => (
              <li key={`${entry.ts}-${index}`}>
                <span className="activity-marker" aria-hidden="true"><Activity /></span>
                <span className="activity-event">{formatActivity(entry.action)}</span>
                <span className="activity-actor">{entry.actor}</span>
                <time dateTime={entry.ts}>{timeAgo(entry.ts)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function StatusLoading() {
  return (
    <div className="status-page" aria-busy="true" aria-label="Loading Forge status">
      <header className="status-page-heading">
        <div><p className="status-eyebrow">OPERATIONS / CONTROL PLANE</p><Skeleton className="h-8 w-36" /></div>
        <Skeleton className="h-9 w-24" />
      </header>
      <Skeleton className="status-hero-skeleton" />
      <div className="status-signal-skeleton-grid">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-16" />)}</div>
      <div className="status-card-skeleton-grid">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-48" />)}</div>
    </div>
  )
}

function StatusIcon({ state }: { state: HealthState }) {
  const Icon = STATE_ICON[state]
  return <Icon aria-hidden="true" />
}

export function SystemStateLabel({ state, label }: { state: HealthState; label?: string }) {
  const Icon = STATE_ICON[state]
  return (
    <span className={`system-state-label state-${state}`}>
      <Icon aria-hidden="true" />
      {label || STATE_LABEL[state]}
    </span>
  )
}

function IncidentSummaryRow({ incident, application, onOpen }: {
  incident: IncidentSummary
  application?: ApplicationStatus
  onOpen: () => void
}) {
  return (
    <button className="incident-summary-row" onClick={onOpen}>
      <span className="incident-row-icon"><FileWarning aria-hidden="true" /></span>
      <span className="incident-row-copy">
        <strong>{application?.name || 'Application health check failed'}</strong>
        <span>{incident.cause || application?.healthError || 'Repeated application health-check failures.'}</span>
      </span>
      <time dateTime={incident.startedAt}>{timeAgo(incident.startedAt)}</time>
      <ArrowRight aria-hidden="true" />
    </button>
  )
}

function ServerSummaryCard({ server, applications, applicationDetailsAvailable, onOpen, onOpenProject }: {
  server: Server
  applications: ApplicationStatus[]
  applicationDetailsAvailable: boolean
  onOpen: () => void
  onOpenProject: (projectId: string) => void
}) {
  const state = getServerState(server, applications)
  const release = applications.find((application) => application.currentDeployment)?.currentDeployment
  const providerLabel = server.provider === 'ec2' ? `AWS EC2${server.region ? ` · ${server.region}` : ''}` : 'Existing host'
  const agentState = server.agent?.state === 'ready' ? 'healthy' : server.agent ? 'attention' : 'unknown'
  const agentLabel = server.agent?.state === 'ready'
    ? 'Online'
    : server.agent?.state === 'stale'
      ? 'Stale'
      : server.agent?.state === 'error'
        ? 'Install failed'
        : 'Not installed'

  return (
    <article className={`server-summary-card state-${state}`}>
      <button className="server-card-open" onClick={onOpen} aria-label={`Open health details for ${server.name}`}>
        <span className="server-card-main">
          <span className="server-avatar"><ServerIcon aria-hidden="true" /></span>
          <span className="server-title-wrap">
            <strong>{server.name}</strong>
            <span className="server-address">{server.host}</span>
          </span>
          <span className="server-card-state"><SystemStateLabel state={state} /></span>
        </span>
        <span className="server-provider-line">{providerLabel}</span>
        <span className="server-fact-row">
          <span><span className="fact-label">Forge setup</span><SystemStateLabel state={server.status === 'ready' ? 'healthy' : server.status === 'bootstrap_failed' ? 'critical' : 'attention'} label={server.status === 'ready' ? 'Ready' : server.status.replace(/_/g, ' ')} /></span>
          <span><span className="fact-label">Telemetry agent</span><SystemStateLabel state={agentState} label={agentLabel} /></span>
        </span>
        <span className="server-data-line">
          <span>{applicationDetailsAvailable ? `${applications.length} ${applications.length === 1 ? 'application' : 'applications'}` : 'Applications unavailable'}</span>
          <span>{applicationDetailsAvailable ? release ? `Release #${release.number}` : 'No release yet' : 'Release unavailable'}</span>
        </span>
        {server.statusError && <span className="server-summary-error">{server.statusError}</span>}
        {applications.length === 0 && applicationDetailsAvailable && !server.statusError && (
          <span className="server-telemetry-note">Install the telemetry agent in server details for scheduled host readings.</span>
        )}
        <span className="server-card-link">View server health <ArrowRight aria-hidden="true" /></span>
      </button>
      {applications.length > 0 && (
        <div className="server-app-links" aria-label="Applications on this server">
          {applications.slice(0, 2).map((application) => (
            <button key={application.id} onClick={() => onOpenProject(application.id)}>
              {application.name}<span>{STATE_LABEL[application.health]}</span>
            </button>
          ))}
          {applications.length > 2 && <span>+{applications.length - 2} more</span>}
        </div>
      )}
    </article>
  )
}

function ApplicationSummaryRow({ application, server, onOpen }: {
  application: ApplicationStatus
  server?: Server
  onOpen: () => void
}) {
  const deployment = application.currentDeployment
  return (
    <button className="application-status-row" onClick={onOpen}>
      <span className="application-name-cell">
        <FolderGit2 aria-hidden="true" />
        <span><strong>{application.name}</strong><small>{application.repoFullName} · {application.branch}</small></span>
      </span>
      <span className="application-health-cell"><SystemStateLabel state={application.health} /></span>
      <span className="application-release-cell">
        {deployment ? `#${deployment.number} · ${deployment.status}` : 'No deployment'}
        {deployment?.error && <small>{deployment.error}</small>}
      </span>
      <span className="application-server-cell">{server?.name || 'No server assigned'}</span>
      <ExternalLink aria-hidden="true" />
    </button>
  )
}

export function getServerState(server: Server, applications: ApplicationStatus[]): HealthState {
  if (server.status === 'bootstrap_failed') return 'critical'
  if (server.status !== 'ready') return 'attention'
  if (applications.some((application) => application.health === 'critical')) return 'critical'
  if (applications.some((application) => application.health === 'attention')) return 'attention'
  if (applications.length && applications.every((application) => application.health === 'healthy')) return 'healthy'
  return 'unknown'
}

function getOverallLabel(state: HealthState) {
  if (state === 'healthy') return 'All monitored systems operational'
  if (state === 'attention') return 'Attention required'
  if (state === 'critical') return 'Critical incident'
  return 'Status is partially known'
}

function getOverallMessage(data: DashboardData, servers: Server[]) {
  if (data.overall === 'critical') {
    const incidentCount = data.openIncidents.length
    return incidentCount
      ? `${incidentCount} active incident${incidentCount === 1 ? '' : 's'} need investigation.`
      : 'An application health check is failing. Review the affected workload and recent release.'
  }
  if (data.overall === 'attention') {
    const needsReview = servers.filter((server) => server.status !== 'ready').length
    return needsReview
      ? `${needsReview} server${needsReview === 1 ? '' : 's'} need setup or connection review.`
      : 'A recent deployment needs review. Open the affected application for release details.'
  }
  if (data.overall === 'unknown') {
    if (data.applications.length === 0) {
      return servers.length
        ? 'Forge is online. Connect an application to begin health checks.'
        : 'Forge is online. Connect a server and deploy an application to begin health checks.'
    }
    return servers.length || data.applications.length
      ? 'Forge is online, but one or more applications do not have a current health signal.'
      : 'Forge is online. Connect a server and deploy an application to begin health checks.'
  }
  return 'Application health checks are passing. Install a host agent from server details to report resource, network, and TLS telemetry here.'
}

function formatActivity(action: string) {
  return action
    .split('.')
    .map((part) => part.replace(/[_-]/g, ' '))
    .join(' · ')
}