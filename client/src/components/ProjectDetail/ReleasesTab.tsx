import { DeploymentStatusPill } from './DeploymentStatusPill'
import { timeAgo } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface ReleasesTabProps {
  project: any
  latestDeployment: any
  isBuilding: boolean
  onRollback: (id: string) => void
}

export function ReleasesTab({ project, latestDeployment, isBuilding, onRollback }: ReleasesTabProps) {
  const deployments = project.deployments || []

  if (deployments.length === 0) {
    return (
      <div className="card empty-state py-12">
        <h3 className="text-[var(--color-text)] mb-2">No deployments yet</h3>
        <p className="text-[var(--color-text-secondary)] mb-4">Click Deploy to ship the current branch.</p>
      </div>
    )
  }

  const rows = deployments.map((d: any) => {
    const isCurrent = d.id === latestDeployment?.id
    return (
      <tr key={d.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-raised)]">
        <td className="font-medium px-3 py-2">#{d.number}</td>
        <td className="font-mono text-sm px-3 py-2">{d.commitSha || '—'}</td>
        <td className="px-3 py-2">
          <div className="release-status-stack">
            <DeploymentStatusPill status={d.status} />
            {isBuilding && isCurrent && (
              <p className="release-progress" role="status" aria-live="polite">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Build and health checks are running.
              </p>
            )}
            {d.error && (
              <p className="deployment-error" role={isCurrent ? 'alert' : 'note'}>
                {d.error}
              </p>
            )}
          </div>
        </td>
        <td className="text-sm px-3 py-2">{d.trigger}</td>
        <td className="text-sm text-[var(--color-text-muted)] px-3 py-2">{timeAgo(d.startedAt)}</td>
        <td className="px-3 py-2">
          {d.id === latestDeployment?.id ? (
            <span className="pill pill-neutral text-xs">current</span>
          ) : d.status === 'success' ? (
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => onRollback(d.id)}
            >
              Rollback here
            </button>
          ) : null}
        </td>
      </tr>
    )
  })

  return (
    <div className="card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="w-16 h-10 px-3 text-left font-semibold text-[var(--color-text-muted)] text-[11.5px] border-b border-[var(--color-border)]">#</th>
            <th className="h-10 px-3 text-left font-semibold text-[var(--color-text-muted)] text-[11.5px] border-b border-[var(--color-border)]">Commit</th>
            <th className="w-40 h-10 px-3 text-left font-semibold text-[var(--color-text-muted)] text-[11.5px] border-b border-[var(--color-border)]">Status</th>
            <th className="w-32 h-10 px-3 text-left font-semibold text-[var(--color-text-muted)] text-[11.5px] border-b border-[var(--color-border)]">Trigger</th>
            <th className="w-40 h-10 px-3 text-left font-semibold text-[var(--color-text-muted)] text-[11.5px] border-b border-[var(--color-border)]">When</th>
            <th className="w-32 h-10 px-3 text-left font-semibold text-[var(--color-text-muted)] text-[11.5px] border-b border-[var(--color-border)]">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    </div>
  )
}