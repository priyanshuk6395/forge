import { Badge } from '@/components/ui/Badge'

interface DeploymentStatusPillProps {
  status: string
}

export function DeploymentStatusPill({ status }: DeploymentStatusPillProps) {
  const variants: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
    success: 'success',
    healthy: 'success',
    building: 'warning',
    failed: 'danger',
    blocked: 'danger',
  }
  return <Badge variant={variants[status] || 'neutral'}>{status}</Badge>
}