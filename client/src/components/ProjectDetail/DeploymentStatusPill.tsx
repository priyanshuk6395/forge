// client/src/components/ProjectDetail/DeploymentStatusPill.tsx
import { Badge } from '@/components/ui/Badge'

interface DeploymentStatusPillProps {
  status: string
}

export function DeploymentStatusPill({ status }: DeploymentStatusPillProps) {
  const variants: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
    success: 'success',
    healthy: 'success',
    ready: 'success',
    building: 'warning',
    attention: 'warning',
    connecting: 'warning',
    provisioning: 'warning',
    failed: 'danger',
    blocked: 'danger',
    critical: 'danger',
    bootstrap_failed: 'danger',
    danger: 'danger',
  }
  return (
    <Badge variant={variants[status] || 'neutral'}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}