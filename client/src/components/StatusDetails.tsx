import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Cpu,
  FileText,
  FolderGit2,
  HardDrive,
  Loader2,
  MemoryStick,
  Network,
  RotateCcw,
  Server as ServerIcon,
  ShieldCheck,
  Wifi,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toaster'
import { useDeleteServer, useRollbackProject, useTestServer } from '@/api/queries'
import type { ActivityEntry, ApplicationStatus, AuditEvent, IncidentSummary, Server, ServerRequirementReport } from '@/api/types'
import { timeAgo } from '@/lib/utils'
import { getServerState, SystemStateLabel } from '@/components/StatusCenter'
import { Skeleton } from '@/components/ui/Skeleton'

interface ServerHealthDetailProps {
  server?: Server
  applications: ApplicationStatus[]
  activity: ActivityEntry[]
  onBack: () => void
  onOpenProject: (projectId: string, tab?: 'releases' | 'logs') => void
}

export function ServerHealthDetail({ server, applications, activity, onBack, onOpenProject }: ServerHealthDetailProps) {
  const { toast } = useToast()
  const testServer = useTestServer()
  const deleteServer = useDeleteServer()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [actionMessage, setActionMessage] = useState('')

  if (!server) {
    return <DetailUnavailable title="Server unavailable" onBack={onBack} />
  }

  const attachedApps = applications.filter((application) => application.serverId === server.id)
  const state = getServerState(server, attachedApps)
  const latestRelease = attachedApps
    .map((application) => application.currentDeployment)
    .filter((deployment): deployment is NonNullable<ApplicationStatus['currentDeployment']> => Boolean(deployment))
    .sort((left, right) => right.number - left.number)[0]

  const handleTest = async () => {
    setActionMessage('Testing SSH connection…')
    try {
      await testServer.mutateAsync(server.id)
      setActionMessage('SSH connection verified.')
      toast('SSH connection verified.', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SSH connection test failed.'
      setActionMessage(message)
      toast(message, 'error')
    }
  }

  const handleRemove = async () => {
    try {
      await deleteServer.mutateAsync(server.id)
      toast(server.provider === 'ec2' ? 'Server removed from Forge. Its EC2 instance was not terminated.' : 'Server removed from Forge.', 'success')
      setConfirmRemove(false)
      onBack()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove this server.'
      setActionMessage(message)
      toast(message, 'error')
    }
  }

  return (
    <div className="detail-page server-detail-page">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft aria-hidden="true" /> Servers</Button>
      <header className={`detail-hero state-${state}`}>
        <span className="detail-hero-icon"><ServerIcon aria-hidden="true" /></span>
        <div className="detail-hero-copy">
          <p className="status-eyebrow">SERVER HEALTH</p>
          <h1>{server.name}</h1>
          <p className="technical-value">{server.host}</p>
        </div>
        <SystemStateLabel state={state} />
      </header>

      {server.statusError && (
        <section className={`detail-connection-alert state-${state}`} role={state === 'critical' ? 'alert' : 'status'}>
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>{server.status === 'bootstrap_failed' ? 'Server bootstrap failed' : 'Latest connection issue'}</strong>
            <p>{server.statusError}</p>
            <p>Check SSH access and server setup, then test the connection again.</p>
          </div>
        </section>
      )}

      <section className="detail-section" aria-labelledby="connection-heading">
        <div className="status-section-heading"><div><p className="status-eyebrow">CONNECTION</p><h2 id="connection-heading">Host details</h2></div></div>
        <dl className="detail-fact-grid">
          <Fact label="Forge setup" value={server.status.replace(/_/g, ' ')} />
          <Fact label="SSH user" value={server.sshUser || 'Not reported'} technical />
          <Fact label="SSH port" value={server.sshPort ? String(server.sshPort) : 'Not reported'} technical />
          <Fact label="Provider" value={server.provider === 'ec2' ? 'Amazon EC2' : 'Existing host'} />
          <Fact label="Region" value={server.region || 'Not reported'} technical={!server.region} />
          <Fact label="Instance ID" value={server.instanceId || 'Not applicable'} technical={Boolean(server.instanceId)} />
          <Fact label="Applications" value={String(attachedApps.length)} />
          <Fact label="Current release" value={latestRelease ? `#${latestRelease.number} · ${latestRelease.status}` : 'No release yet'} />
          <Fact label="Last deploy" value={latestRelease ? timeAgo(latestRelease.startedAt) : 'No deployment recorded'} />
        </dl>
      </section>

      <section className="detail-section" aria-labelledby="telemetry-heading">
        <div className="status-section-heading"><div><p className="status-eyebrow">HOST TELEMETRY</p><h2 id="telemetry-heading">Resource health</h2></div></div>
        <div className="telemetry-grid">
          <TelemetryFact icon={Cpu} label="CPU" value="Not reported" />
          <TelemetryFact icon={MemoryStick} label="Memory" value="Not reported" />
          <TelemetryFact icon={HardDrive} label="Disk" value="Not reported" />
          <TelemetryFact icon={Network} label="Network" value="Not monitored" />
          <TelemetryFact icon={ShieldCheck} label="SSL / TLS" value="Not monitored" />
          <TelemetryFact icon={Activity} label="Agent" value="Not installed" />
        </div>
        <p className="detail-context-note"><CircleHelp aria-hidden="true" /> Forge has SSH/bootstrap and application health-check results, but no host agent for resource or certificate telemetry.</p>
      </section>

      <section className="detail-section" aria-labelledby="setup-checks-heading">
        <div className="status-section-heading"><div><p className="status-eyebrow">SERVER SETUP</p><h2 id="setup-checks-heading">Initialization checks</h2></div></div>
        {server.setupChecks ? (
          <div className="setup-checks-grid">
            <SetupCheckPhase phase="pre" title="Before initialization" report={server.setupChecks.preInit} />
            <SetupCheckPhase phase="post" title="After initialization" report={server.setupChecks.postInit} />
          </div>
        ) : (
          <p className="detail-context-note"><CircleHelp aria-hidden="true" /> This server has not reported pre- and post-initialization requirement checks.</p>
        )}
      </section>

      <section className="detail-section" aria-labelledby="workloads-heading">
        <div className="status-section-heading"><div><p className="status-eyebrow">WORKLOADS</p><h2 id="workloads-heading">Applications on {server.name}</h2></div></div>
        {attachedApps.length === 0 ? (
          <EmptyDetail icon={FolderGit2} title="No applications assigned" description="Create an application and select this server as its deployment target." />
        ) : (
          <div className="application-status-list">
            {attachedApps.map((application) => (
              <button className="application-status-row" key={application.id} onClick={() => onOpenProject(application.id)}>
                <span className="application-name-cell"><FolderGit2 aria-hidden="true" /><span><strong>{application.name}</strong><small>{application.repoFullName} · {application.branch}</small></span></span>
                <span className="application-health-cell"><SystemStateLabel state={application.health} /></span>
                <span className="application-release-cell">{application.currentDeployment ? `#${application.currentDeployment.number} · ${application.currentDeployment.status}` : 'No deployment'}</span>
                <ArrowRight aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="detail-section" aria-labelledby="server-activity-heading">
        <div className="status-section-heading"><div><p className="status-eyebrow">EVENTS</p><h2 id="server-activity-heading">Recent activity</h2></div></div>
        <ActivityList entries={activity.filter((entry) => entry.action.startsWith('server.') || entry.action.includes(server.id)).slice(0, 6)} />
      </section>

      <div className="detail-action-bar">
        {actionMessage && <p className="detail-action-message" role="status" aria-live="polite">{actionMessage}</p>}
        <Button variant="subtle" onClick={handleTest} disabled={testServer.isPending}>
          {testServer.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Wifi aria-hidden="true" />}
          {testServer.isPending ? 'Testing SSH' : 'Test SSH'}
        </Button>
        <Button variant="danger" onClick={() => setConfirmRemove(true)}>Remove from Forge</Button>
      </div>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove {server.name} from Forge?</DialogTitle></DialogHeader>
          <DialogDescription>
            This removes the server connection from Forge. It does not stop or terminate the host{server.provider === 'ec2' ? ' or its EC2 instance' : ''}. Applications assigned to this server must be moved or removed first.
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={deleteServer.isPending}>Cancel</Button>
            <Button variant="danger" onClick={handleRemove} disabled={deleteServer.isPending}>
              {deleteServer.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {deleteServer.isPending ? 'Removing…' : 'Remove server'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface IncidentDetailProps {
  incident?: IncidentSummary
  application?: ApplicationStatus
  server?: Server
  onBack: () => void
  onInvestigate: (projectId: string) => void
  onViewLogs: (projectId: string) => void
}

export function IncidentDetail({ incident, application, server, onBack, onInvestigate, onViewLogs }: IncidentDetailProps) {
  const { toast } = useToast()
  const rollback = useRollbackProject(application?.id || '')
  const [confirmRollback, setConfirmRollback] = useState(false)
  const targetRelease = application?.previousSuccessfulDeployment

  if (!incident) return <DetailUnavailable title="Incident unavailable" onBack={onBack} />

  const cause = incident.cause || application?.healthError || 'Repeated health checks failed.'
  const handleRollback = async () => {
    if (!targetRelease) return
    try {
      await rollback.mutateAsync(targetRelease.id)
      toast(`Rollback to release #${targetRelease.number} started.`, 'success')
      setConfirmRollback(false)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not start the rollback.', 'error')
    }
  }

  return (
    <div className="detail-page incident-detail-page">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft aria-hidden="true" /> Incidents</Button>
      <section className="incident-detail-hero" role="alert">
        <span className="incident-detail-icon"><AlertTriangle aria-hidden="true" /></span>
        <div>
          <p className="status-eyebrow">APPLICATION INCIDENT</p>
          <h1>{application ? `${application.name} is unhealthy` : 'Application health check is failing'}</h1>
          <p>{server ? `${server.name} · ${server.host}` : 'Server details are unavailable'} · started {timeAgo(incident.startedAt)}</p>
        </div>
        <SystemStateLabel state="critical" label="Open incident" />
      </section>

      <section className="incident-diagnosis" aria-labelledby="likely-cause-heading">
        <div className="incident-narrative-block">
          <p className="status-eyebrow">LIKELY CAUSE</p>
          <h2 id="likely-cause-heading">{cause}</h2>
          <p>Forge opened this incident after repeated application health-check failures. Host memory and container restart telemetry are not available.</p>
        </div>
        <div className="incident-evidence-block">
          <p className="status-eyebrow">EVIDENCE</p>
          <ul>
            <li><span>Health-check failures</span><strong>{application?.consecutiveFailures || '3+'}</strong></li>
            <li><span>Last check</span><strong>{application?.lastCheckedAt ? timeAgo(application.lastCheckedAt) : 'Not reported'}</strong></li>
            <li><span>Current release</span><strong>{application?.currentDeployment ? `#${application.currentDeployment.number} · ${application.currentDeployment.status}` : 'No release data'}</strong></li>
            <li><span>Host telemetry</span><strong>Unavailable</strong></li>
          </ul>
          {application?.currentDeployment?.error && <p className="incident-deployment-error">{application.currentDeployment.error}</p>}
        </div>
      </section>

      <section className="incident-recommendation" aria-labelledby="recommendation-heading">
        <div className="recommendation-icon"><RotateCcw aria-hidden="true" /></div>
        <div className="recommendation-copy">
          <p className="status-eyebrow">RECOMMENDED ACTION</p>
          <h2 id="recommendation-heading">{targetRelease ? `Rollback to release #${targetRelease.number}` : 'Investigate the failing release'}</h2>
          <p>{targetRelease ? 'This restores the last successful application version. New changes will be replaced; the server and stored data are not changed.' : 'No previous successful release is available to roll back to. Review application logs and the current release first.'}</p>
        </div>
        <div className="recommendation-actions">
          {targetRelease && <Button onClick={() => setConfirmRollback(true)} disabled={rollback.isPending}>Rollback</Button>}
          {application && <Button variant="subtle" onClick={() => onInvestigate(application.id)}>Investigate</Button>}
          {application && <Button variant="ghost" onClick={() => onViewLogs(application.id)}><FileText aria-hidden="true" /> View logs</Button>}
        </div>
      </section>

      <Dialog open={confirmRollback} onOpenChange={setConfirmRollback}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rollback {application?.name} to release #{targetRelease?.number}?</DialogTitle></DialogHeader>
          <DialogDescription>
            Forge will redeploy the last successful release to {server?.name || 'the assigned server'}. The current version may be interrupted while the rollback runs. Review the release history and logs if you are unsure.
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRollback(false)} disabled={rollback.isPending}>Cancel</Button>
            <Button onClick={handleRollback} disabled={rollback.isPending || !targetRelease}>
              {rollback.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {rollback.isPending ? 'Starting rollback…' : 'Confirm rollback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function IncidentList({ incidents, applications, isLoading, error, onRetry, onOpenIncident }: {
  incidents: IncidentSummary[]
  applications: ApplicationStatus[]
  isLoading: boolean
  error?: Error | null
  onRetry: () => void
  onOpenIncident: (incidentId: string) => void
}) {
  return (
    <div className="activity-page">
      <header className="status-page-heading">
        <div><p className="status-eyebrow">OPERATIONS</p><h1>Incidents</h1><p className="status-page-description">Active issues detected by Forge health checks.</p></div>
      </header>
      {error ? (
        <section className="status-error-state" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div><h2>Incidents unavailable</h2><p>{error.message}</p><Button variant="subtle" onClick={onRetry}>Retry</Button></div>
        </section>
      ) : isLoading ? (
        <div className="incident-loading-list" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16" />)}</div>
      ) : incidents.length === 0 ? (
        <EmptyDetail icon={CheckCircle2} title="No active incidents" description="Forge will list application health incidents here when repeated checks fail." />
      ) : (
        <div className="incident-list">
          {incidents.map((incident) => {
            const application = applications.find((item) => item.id === incident.projectId)
            return (
              <button className="incident-summary-row" key={incident.id} onClick={() => onOpenIncident(incident.id)}>
                <span className="incident-row-icon"><AlertTriangle aria-hidden="true" /></span>
                <span className="incident-row-copy"><strong>{application?.name || 'Application health check failed'}</strong><span>{incident.cause || application?.healthError || 'Repeated health checks failed.'}</span></span>
                <time dateTime={incident.startedAt}>{timeAgo(incident.startedAt)}</time>
                <ArrowRight aria-hidden="true" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

type ActivityFilter = 'all' | 'deployments' | 'servers' | 'incidents' | 'security' | 'infrastructure'

const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All activity' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'servers', label: 'Servers' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'security', label: 'Security' },
  { id: 'infrastructure', label: 'Infrastructure' },
]

export function ActivityTimeline({ events, isLoading, error, onRetry }: { events: AuditEvent[]; isLoading: boolean; error?: Error | null; onRetry: () => void }) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const visibleEvents = filter === 'all' ? events : events.filter((event) => eventCategory(event.action) === filter)

  return (
    <div className="activity-page">
      <header className="status-page-heading">
        <div><p className="status-eyebrow">AUDIT TRAIL</p><h1>Activity</h1><p className="status-page-description">A chronological record of changes and system events.</p></div>
      </header>
      <div className="activity-filters" role="group" aria-label="Filter activity">
        {ACTIVITY_FILTERS.map((option) => (
          <button key={option.id} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}</button>
        ))}
      </div>
      {error ? (
        <section className="status-error-state" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div><h2>Activity unavailable</h2><p>{error.message}</p><Button variant="subtle" onClick={onRetry}>Retry</Button></div>
        </section>
      ) : isLoading ? (
        <div className="activity-loading" aria-busy="true">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-14" />)}</div>
      ) : visibleEvents.length === 0 ? (
        <EmptyDetail icon={Activity} title={filter === 'all' ? 'No activity yet' : `No ${filter} activity`} description={filter === 'all' ? 'Deployments, server changes, and incidents will appear here.' : 'Choose another filter or return to all activity.'} />
      ) : (
        <ActivityList entries={visibleEvents} showResult />
      )}
    </div>
  )
}

function ActivityList({ entries, showResult = false }: { entries: (ActivityEntry | AuditEvent)[]; showResult?: boolean }) {
  if (!entries.length) return <p className="status-empty-text">No activity for this resource yet.</p>
  return (
    <ol className="detail-activity-list">
      {entries.map((entry, index) => {
        const auditEntry = entry as AuditEvent
        return (
          <li key={`${entry.ts}-${index}`}>
            <span className="activity-marker" aria-hidden="true"><Activity /></span>
            <span className="detail-activity-main"><strong>{formatActivityAction(entry.action)}</strong><small>{entry.actor}</small></span>
            {showResult && <SystemStateLabel state={auditEntry.result === 'danger' ? 'critical' : 'healthy'} label={auditEntry.result === 'danger' ? 'Failed' : 'Success'} />}
            <time dateTime={entry.ts}>{timeAgo(entry.ts)}</time>
          </li>
        )
      })}
    </ol>
  )
}

function TelemetryFact({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="telemetry-fact">
      <span><Icon aria-hidden="true" /> {label}</span>
      <strong><CircleHelp aria-hidden="true" /> {value}</strong>
    </div>
  )
}

function SetupCheckPhase({ phase, title, report }: { phase: 'pre' | 'post'; title: string; report: ServerRequirementReport }) {
  const summary = report.ready
    ? 'All requirements ready'
    : !report.canInitialize
      ? 'Initialization blocked'
      : phase === 'pre'
        ? 'Missing tools will be installed'
        : 'Requirements still missing'

  return (
    <article className={`setup-check-phase ${report.ready ? 'state-ready' : report.canInitialize ? 'state-attention' : 'state-critical'}`}>
      <header className="setup-check-phase-heading">
        <strong>{title}</strong>
        <span>{summary}</span>
      </header>
      <ul className="setup-check-list">
        {report.checks.map((check) => {
          const Icon = check.state === 'ready' ? CheckCircle2 : check.state === 'unsupported' ? AlertTriangle : CircleHelp
          const label = check.state === 'ready' ? 'Ready' : check.state === 'unsupported' ? 'Unsupported' : 'Missing'
          return (
            <li className="setup-check-row" data-state={check.state} key={check.id}>
              <Icon aria-hidden="true" />
              <span>{check.label}</span>
              <small>{label}</small>
            </li>
          )
        })}
      </ul>
      <p className="setup-check-meta">{report.platform || 'Unknown host'} · checked {timeAgo(report.checkedAt)}</p>
    </article>
  )
}

function Fact({ label, value, technical = false }: { label: string; value: string; technical?: boolean }) {
  return (
    <div className="detail-fact">
      <dt>{label}</dt>
      <dd className={technical ? 'technical-value' : undefined}>{value}</dd>
    </div>
  )
}

function EmptyDetail({ icon: Icon, title, description }: { icon: typeof CheckCircle2; title: string; description: string }) {
  return (
    <section className="status-empty-state">
      <span><Icon aria-hidden="true" /></span>
      <div><h2>{title}</h2><p>{description}</p></div>
    </section>
  )
}

function DetailUnavailable({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="detail-page">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft aria-hidden="true" /> Back</Button>
      <EmptyDetail icon={CircleHelp} title={title} description="The resource may have been removed or is not available in the latest status snapshot." />
    </div>
  )
}

function eventCategory(action: string): ActivityFilter | 'other' {
  if (action.startsWith('deployment.')) return 'deployments'
  if (action.startsWith('server.')) return 'servers'
  if (action.startsWith('incident.')) return 'incidents'
  if (action.startsWith('security.') || action.includes('secret')) return 'security'
  if (action.startsWith('project.') || action.startsWith('settings.') || action.startsWith('github.')) return 'infrastructure'
  return 'other'
}

function formatActivityAction(action: string) {
  return action.split('.').map((part) => part.replace(/[_-]/g, ' ')).join(' · ')
}