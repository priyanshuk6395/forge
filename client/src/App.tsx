'use client'

import * as React from 'react'
import { LayoutDashboard, FolderGit2, Server, History, Settings, Menu, X, Search, Command, User, LogOut, Sun, Moon, Plus, ExternalLink, RefreshCw, Trash2, Key, Zap, Github, Aws, Loader2, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Label } from '@/components/ui/Label'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/DropdownMenu'
import { useToast } from '@/components/ui/Toaster'
import { 
  useDashboard,
  useProjects,
  useCreateProject,
  fetchGitHubRepos,
  fetchGitHubBranches,
  fetchGitHubDetect,
  useServers,
  useConnectServer,
  useProvisionServer,
  useTestServer,
  useDeleteServer,
  useSettings,
  useConnectGitHub,
  useDisconnectGitHub,
  useSaveAWS,
  useAudit
} from '@/api/queries'
import { timeAgo } from '@/lib/utils'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'audit', label: 'Audit log', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

type ViewId = typeof NAV_ITEMS[number]['id']

function HealthPill({ state }: { state: 'healthy' | 'attention' | 'critical' }) {
  const variants = {
    healthy: 'success' as const,
    attention: 'warning' as const,
    critical: 'danger' as const,
  }
  return <Badge variant={variants[state]}>{state.charAt(0).toUpperCase() + state.slice(1)}</Badge>
}

function DeploymentStatusPill({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
    success: 'success',
    healthy: 'success',
    building: 'warning',
    failed: 'danger',
    blocked: 'danger',
  }
  return <Badge variant={variants[status] || 'neutral'}>{status}</Badge>
}

function ServerStatusPill({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
    ready: 'success',
    connecting: 'warning',
    provisioning: 'warning',
    bootstrap_failed: 'danger',
  }
  return <Badge variant={variants[status] || 'neutral'}>{status.replace('_', ' ')}</Badge>
}

export default function App() {
  const [currentView, setCurrentView] = React.useState<ViewId>('dashboard')
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false)
  const [theme, setTheme] = React.useState<'light' | 'dark'>('dark')
  const { toast } = useToast()

  const { data: dashboard, isLoading: dashboardLoading } = useDashboard()
  const { data: projects, isLoading: projectsLoading, createProject } = useProjects()
  const { data: servers, isLoading: serversLoading, connectServer, provisionServer, testServer, deleteServer } = useServers()
  const { data: settings, isLoading: settingsLoading, connectGitHub, disconnectGitHub, saveAWS } = useSettings()
  const { data: audit, isLoading: auditLoading } = useAudit()

  React.useEffect(() => {
    const saved = localStorage.getItem('forge-theme') as 'light' | 'dark' | null
    const initial = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    setTheme(initial)
    document.documentElement.classList.toggle('light', initial === 'light')
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('forge-theme', next)
    document.documentElement.classList.toggle('light', next === 'light')
  }

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView data={dashboard} isLoading={dashboardLoading} />
      case 'projects':
        return <ProjectsView projects={projects} isLoading={projectsLoading} createProject={createProject} />
      case 'servers':
        return <ServersView servers={servers} isLoading={serversLoading} connectServer={connectServer} provisionServer={provisionServer} testServer={testServer} deleteServer={deleteServer} />
      case 'audit':
        return <AuditView data={audit} isLoading={auditLoading} />
      case 'settings':
        return <SettingsView settings={settings} isLoading={settingsLoading} connectGitHub={connectGitHub} disconnectGitHub={disconnectGitHub} saveAWS={saveAWS} />
      default:
        return <DashboardView data={dashboard} isLoading={dashboardLoading} />
    }
  }

  return (
    <div className="app-shell min-h-screen flex">
      <aside
        className={cn(
          'sidebar w-55 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col p-4 gap-1',
          'lg:static lg:translate-x-0 lg:z-auto',
          sidebarOpen && 'lg:hidden fixed inset-y-0 left-0 z-50 transform transition-transform duration-180 translate-x-0',
          !sidebarOpen && 'lg:hidden fixed inset-y-0 left-0 z-50 -translate-x-full transform transition-transform duration-180'
        )}
      >
        <div className="sidebar-brand flex items-center gap-2 px-2 py-2 mb-4 font-bold text-lg tracking-tighter">
          <span className="mark w-5.5 h-5.5 rounded-[6px] flex-shrink-0 bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-strong)]" />
          Forge
        </div>
        <nav className="flex-1 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => { setCurrentView(item.id); setSidebarOpen(false); }}
              className={cn(
                'nav-item flex items-center gap-2.5 px-2.5 py-2.5 rounded-[8px] text-sm text-[var(--color-text-secondary)]',
                'hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)] transition-colors',
                currentView === item.id && 'bg-[var(--color-surface-raised)] text-[var(--color-text)] font-semibold'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer mt-auto pt-2 flex flex-col gap-2">
          <button
            onClick={toggleTheme}
            className="chip flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-semibold bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text-secondary)] cursor-pointer hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
          >
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            Theme
          </button>
          <button
            onClick={() => toast('Logged out')}
            className="nav-item flex items-center gap-2.5 px-2.5 py-2.5 rounded-[8px] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)]"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="main flex-1 min-w-0 flex flex-col">
        <header className={cn(
          'topbar h-13 flex-shrink-0 flex items-center justify-between px-5 border-b border-[var(--color-border)] sticky top-0 z-10 bg-[var(--color-surface)]',
          'supports-[backdrop-filter]:bg-[rgba(27,31,36,0.72)] supports-[backdrop-filter]:backdrop-blur-[14px] supports-[backdrop-filter]:saturate-[1.1]'
        )}>
          <div className="inline-row items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden btn btn-ghost btn-sm p-2"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="breadcrumb text-sm text-[var(--color-text-secondary)]">
              <strong className="text-[var(--color-text)] font-semibold capitalize">{currentView}</strong>
            </div>
          </div>
          <div className="topbar-actions flex items-center gap-2">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="palette-trigger flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] border border-[var(--color-border)] text-[var(--color-text-muted)] text-sm bg-[var(--color-surface-raised)] cursor-pointer"
            >
              <Command className="w-4 h-4" />
              <span className="hidden sm:inline label">Jump to…</span>
            </button>
            <Badge variant="neutral">User</Badge>
          </div>
        </header>

        <main className="content flex-1 p-6 container-type inline-size overflow-y-auto">
          {renderView()}
        </main>
      </div>
    </div>
  )
}

function DashboardView({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="health-hero rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-7 h-32" />
        <Card>
          <CardHeader><h2 className="text-base font-semibold">Overview</h2></CardHeader>
          <div className="tiles grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1,2,3,4].map((i) => (
              <Skeleton key={i} className="tile rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 h-20" />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent activity</h2>
          </CardHeader>
          <Skeleton className="h-20" />
        </Card>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-4">
      <div className={cn(
        'health-hero rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-7 text-center',
        `state-${data.overall}`
      )}>
        <p className="text-sm text-[var(--color-text-secondary)] mb-1">Forge status</p>
        <p className="state text-2xl font-bold tracking-tighter mb-4">
          {data.overall === 'healthy' ? 'All systems healthy' : data.overall === 'attention' ? 'Needs attention' : 'Critical issue'}
        </p>
        <div className="health-components grid grid-cols-4 gap-2.5 max-w-md mx-auto">
          {Object.entries(data.components).map(([key, state]) => (
            <Badge key={key} variant={state === 'healthy' ? 'success' : state === 'attention' ? 'warning' : 'danger'} className="text-xs">
              {key}
            </Badge>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader><h2 className="text-base font-semibold">Overview</h2></CardHeader>
        <div className="tiles grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Projects', value: data.projectCount },
            { label: 'Servers', value: data.serverCount },
            { label: 'Open incidents', value: data.openIncidents },
            { label: 'Signed in as', value: 'User' },
          ].map((tile, i) => (
            <div key={i} className="tile rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 text-center">
              <p className="label text-xs text-[var(--color-text-muted)] mb-1.5">{tile.label}</p>
              <p className="value text-2xl font-bold tracking-tighter">{tile.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent activity</h2>
        </CardHeader>
        <div className="stack space-y-3 text-[var(--color-text-secondary)]">
          {data.recentActivity.length === 0 ? (
            <p className="text-center py-4">Nothing yet — actions you take will show up here.</p>
          ) : (
            data.recentActivity.map((entry: any, i: number) => (
              <div key={i} className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-3 last:border-0">
                <span className="text-sm">{entry.actor} — {entry.action.replace(/\./g, ' · ')}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{timeAgo(entry.ts)}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}

function ProjectsView({ projects, isLoading, createProject }: { projects: any[]; isLoading: boolean; createProject: any }) {
  const [newProjectModal, setNewProjectModal] = React.useState(false)
  const [formStep, setFormStep] = React.useState<'repo' | 'config'>('repo')
  const [repos, setRepos] = React.useState<any[]>([])
  const [branches, setBranches] = React.useState<string[]>([])
  const [detect, setDetect] = React.useState<any>(null)
  const [selectedRepo, setSelectedRepo] = React.useState<any>(null)
  const [formData, setFormData] = React.useState({
    name: '',
    repoFullName: '',
    repoPrivate: false,
    branch: '',
    port: 8080,
    hostPort: 8080,
    healthPath: '/health',
    serverId: '',
    autoHeal: false,
  })
  const [loadingRepos, setLoadingRepos] = React.useState(false)
  const [loadingBranches, setLoadingBranches] = React.useState(false)
  const [loadingDetect, setLoadingDetect] = React.useState(false)

  const { data: servers } = useServers()

  const handleRepoChange = async (repoFullName: string) => {
    const repo = repos.find(r => r.fullName === repoFullName)
    setSelectedRepo(repo)
    setFormData(prev => ({ ...prev, name: repo?.fullName.split('/')[1] || '', repoFullName, repoPrivate: repo?.private || false }))
    setBranches([])
    setDetect(null)
    if (repo) {
      setLoadingBranches(true)
      try {
        const [owner, repoName] = repoFullName.split('/')
        const branches = await fetchGitHubBranches(owner, repoName)
        setBranches(branches)
        if (repo.defaultBranch) {
          setFormData(prev => ({ ...prev, branch: repo.defaultBranch }))
        }
      } finally {
        setLoadingBranches(false)
      }
    }
  }

  const handleBranchChange = async (branch: string) => {
    setFormData(prev => ({ ...prev, branch }))
    setDetect(null)
    if (selectedRepo) {
      setLoadingDetect(true)
      try {
        const [owner, repoName] = selectedRepo.fullName.split('/')
        const detect = await fetchGitHubDetect(owner, repoName, branch)
        setDetect(detect)
      } finally {
        setLoadingDetect(false)
      }
    }
  }

  const openModal = async () => {
    if (!servers?.length) {
      toast('Add a server first', 'error')
      return
    }
    setLoadingRepos(true)
    try {
      const repos = await fetchGitHubRepos()
      setRepos(repos)
    } finally {
      setLoadingRepos(false)
    }
    setFormStep('repo')
    setNewProjectModal(true)
  }

  const handleSubmit = async () => {
    try {
      await createProject.mutateAsync(formData)
      setNewProjectModal(false)
      setFormData({ name: '', repoFullName: '', repoPrivate: false, branch: '', port: 8080, hostPort: 8080, healthPath: '/health', serverId: '', autoHeal: false })
      toast('Project created', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Projects</h2>
        <Button onClick={openModal} disabled={createProject.isPending}>
          {createProject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} New project
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <div className="tiles grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1,2,3,4].map((i) => <Skeleton key={i} className="tile rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 h-20" />)}
          </div>
        </Card>
      ) : projects?.length === 0 ? (
        <Card>
          <div className="empty-state py-12">
            <h3 className="text-[var(--color-text)] mb-2">No projects yet</h3>
            <p className="text-[var(--color-text-secondary)] mb-4">Connect a GitHub repo and a server to deploy your first app.</p>
            <Button onClick={openModal}><Plus className="w-4 h-4 mr-1" /> New project</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Last deploy</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects?.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-sm text-[var(--color-text-muted)] font-mono">{p.repoFullName}</TableCell>
                  <TableCell>{p.branch}</TableCell>
                  <TableCell><HealthPill state={p.health} /></TableCell>
                  <TableCell className="text-sm text-[var(--color-text-muted)]">{p.lastDeployedAt ? timeAgo(p.lastDeployedAt) : 'Never'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">Open</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* New Project Modal */}
      <Dialog open={newProjectModal} onOpenChange={setNewProjectModal}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Step {formStep === 'repo' ? 1 : 2} of 2</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formStep === 'repo' ? (
              <>
                <div className="space-y-2">
                  <Label>Repository</Label>
                  {loadingRepos ? (
                    <Input placeholder="Loading…" disabled />
                  ) : (
                    <Select value={formData.repoFullName} onValueChange={handleRepoChange}>
                      <option value="">Select a repository…</option>
                      {repos.map((r: any) => (
                        <option key={r.fullName} value={r.fullName}>
                          {r.fullName}{r.private ? ' 🔒' : ''}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Select value={formData.branch} onValueChange={handleBranchChange} disabled={!formData.repoFullName || loadingBranches}>
                      <option value="">—</option>
                      {branches.map((b: string) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Project name</Label>
                    <Input value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="my-app" required />
                  </div>
                </div>
                {detect && (
                  <div className="text-sm p-3 rounded border bg-[var(--color-surface-raised)]">
                    {detect.hasDockerfile
                      ? `Dockerfile found${detect.language ? ' · ' + detect.language : ''}.`
                      : 'No Dockerfile found on this branch — add one before deploying, or Forge will fail the build.'}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setNewProjectModal(false)}>Cancel</Button>
                  <Button onClick={() => setFormStep('config')} disabled={!formData.repoFullName || !formData.branch}>Next</Button>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Container port</Label>
                    <Input type="number" value={formData.port} onChange={e => setFormData(prev => ({ ...prev, port: Number(e.target.value) }))} min={1} max={65535} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Host port</Label>
                    <Input type="number" value={formData.hostPort} onChange={e => setFormData(prev => ({ ...prev, hostPort: Number(e.target.value) }))} min={1} max={65535} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Health check path</Label>
                  <Input value={formData.healthPath} onChange={e => setFormData(prev => ({ ...prev, healthPath: e.target.value }))} placeholder="/health" required />
                </div>
                <div className="space-y-2">
                  <Label>Deploy to server</Label>
                  <Select value={formData.serverId} onValueChange={v => setFormData(prev => ({ ...prev, serverId: v }))} required>
                    <option value="">Select a server…</option>
                    {servers?.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formData.autoHeal} onCheckedChange={c => setFormData(prev => ({ ...prev, autoHeal: c }))} />
                  <Label>Auto-restart on repeated health-check failure</Label>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setFormStep('repo')}>Back</Button>
                  <Button onClick={handleSubmit} disabled={createProject.isPending || !formData.name || !formData.serverId}>
                    {createProject.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Create project
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ServersView({ servers, isLoading, connectServer, provisionServer, testServer, deleteServer }: any) {
  const [connectModal, setConnectModal] = React.useState(false)
  const [provisionModal, setProvisionModal] = React.useState(false)
  const [connectForm, setConnectForm] = React.useState({ name: '', host: '', sshUser: 'ubuntu', sshPort: 22, privateKey: '' })
  const [provisionForm, setProvisionForm] = React.useState({ name: '', instanceType: 't3.micro', sshCidr: '0.0.0.0/0' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Servers</h2>
        <div className="inline-row gap-2">
          <Button variant="subtle" onClick={() => setConnectModal(true)}><Key className="w-4 h-4 mr-1" /> Connect existing</Button>
          <Button onClick={() => setProvisionModal(true)}><Zap className="w-4 h-4 mr-1" /> Provision on AWS</Button>
        </div>
      </div>

      {isLoading ? (
        <Card><Skeleton className="h-24" /></Card>
      ) : servers?.length === 0 ? (
        <Card>
          <div className="empty-state py-12">
            <h3 className="text-[var(--color-text)] mb-2">No servers yet</h3>
            <p className="text-[var(--color-text-secondary)] mb-4">Connect any Linux box over SSH, or have Forge provision one on AWS.</p>
            <div className="flex gap-2 justify-center">
              <Button variant="subtle" onClick={() => setConnectModal(true)}>Connect existing</Button>
              <Button onClick={() => setProvisionModal(true)}>Provision on AWS</Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers?.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-sm text-[var(--color-text-muted)] font-mono">{s.host}</TableCell>
                  <TableCell>{s.provider === 'ec2' ? 'AWS EC2' : 'Existing'}</TableCell>
                  <TableCell><ServerStatusPill status={s.status} /></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm"><AlertTriangle className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { testServer.mutate(s.id); toast('SSH test started') }}>
                          <ExternalLink className="w-4 h-4 mr-2" /> Test SSH
                        </DropdownMenuItem>
                        {s.hasKey && (
                          <DropdownMenuItem onClick={() => window.open(`/api/servers/${s.id}/key`, '_blank')}>
                            <Key className="w-4 h-4 mr-2" /> Download key
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { deleteServer.mutate(s.id); toast('Server deleted') }} className="text-red-400">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Connect Modal */}
      <Dialog open={connectModal} onOpenChange={setConnectModal}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Connect an existing server</DialogTitle>
            <DialogDescription>Any Linux box you can already SSH into — an EC2 instance you launched yourself, or anything else.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input label="Name" placeholder="staging-box" value={connectForm.name} onChange={e => setConnectForm(prev => ({ ...prev, name: e.target.value }))} required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Host / IP" placeholder="3.110.221.4" value={connectForm.host} onChange={e => setConnectForm(prev => ({ ...prev, host: e.target.value }))} required />
              <Input type="number" label="SSH port" value={connectForm.sshPort} onChange={e => setConnectForm(prev => ({ ...prev, sshPort: Number(e.target.value) }))} />
            </div>
            <Input label="SSH user" value={connectForm.sshUser} onChange={e => setConnectForm(prev => ({ ...prev, sshUser: e.target.value }))} />
            <Textarea label="Private key (PEM)" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" value={connectForm.privateKey} onChange={e => setConnectForm(prev => ({ ...prev, privateKey: e.target.value }))} rows={6} required />
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setConnectModal(false)}>Cancel</Button>
              <Button onClick={() => { connectServer.mutate(connectForm); setConnectModal(false); toast('Server connected and prepared', 'success') }} disabled={connectServer.isPending}>
                {connectServer.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Connect
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Provision Modal */}
      <Dialog open={provisionModal} onOpenChange={setProvisionModal}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Provision a new EC2 instance</DialogTitle>
            <DialogDescription>Using the AWS credentials saved in Settings (or instance profile).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input label="Name" placeholder="production" value={provisionForm.name} onChange={e => setProvisionForm(prev => ({ ...prev, name: e.target.value }))} required />
            <Select label="Instance type" value={provisionForm.instanceType} onValueChange={v => setProvisionForm(prev => ({ ...prev, instanceType: v }))}>
              <option value="t3.micro">t3.micro</option>
              <option value="t3.small">t3.small</option>
              <option value="t3.medium">t3.medium</option>
              <option value="t3.large">t3.large</option>
            </Select>
            <div className="space-y-2">
              <Label>Allow SSH from (CIDR)</Label>
              <Input value={provisionForm.sshCidr} onChange={e => setProvisionForm(prev => ({ ...prev, sshCidr: e.target.value }))} placeholder="0.0.0.0/0" />
              <p className="text-xs text-[var(--color-text-muted)]">Use your own IP/32 to lock this down; 0.0.0.0/0 allows SSH from anywhere.</p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={() => setProvisionModal(false)}>Cancel</Button>
              <Button onClick={() => { provisionServer.mutate(provisionForm); setProvisionModal(false); toast('Server provisioning started', 'success') }} disabled={provisionServer.isPending}>
                {provisionServer.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Provision
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SettingsView({ settings, isLoading, connectGitHub, disconnectGitHub, saveAWS }: any) {
  const [awsForm, setAwsForm] = React.useState({ accessKeyId: '', secretAccessKey: '', region: '' })

  if (isLoading) return <Card><Skeleton className="h-40" /></Card>

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">GitHub</h2>
        </CardHeader>
        <div className="space-y-4">
          {settings?.github?.connected ? (
            <div className="flex items-center justify-between">
              <div className="inline-row items-center gap-2">
                <Badge variant="success">connected</Badge>
                <span className="text-[var(--color-text-secondary)]">as {settings.github.login}</span>
              </div>
              <Button variant="danger" size="sm" onClick={() => { disconnectGitHub.mutate(); toast('GitHub disconnected') }}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[var(--color-text-secondary)]">Forge needs a GitHub personal access token to list and deploy your repositories.</p>
              <div className="flex gap-2">
                <Input type="password" placeholder="ghp_…" className="flex-1" />
                <Button onClick={() => { connectGitHub.mutate(''); toast('GitHub connected', 'success') }} disabled={connectGitHub.isPending}>
                  {connectGitHub.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
                </Button>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">Needs repo scope. Create one at github.com → Settings → Developer settings → Personal access tokens.</p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">AWS</h2>
        </CardHeader>
        <div className="space-y-4">
          {settings?.aws?.usingInstanceProfile ? (
            <p className="text-[var(--color-text-secondary)]">Using this box's own EC2 instance profile for AWS access.</p>
          ) : settings?.aws?.configured ? (
            <p className="text-[var(--color-text-secondary)]">Configured for region <strong>{settings.aws.region}</strong>.</p>
          ) : (
            <p className="text-[var(--color-text-secondary)]">No keys saved — Forge will use this instance's own EC2 IAM role if it has one, needed only if you want Forge to provision new EC2 servers for you.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Access key ID" placeholder="AKIA…" value={awsForm.accessKeyId} onChange={e => setAwsForm(prev => ({ ...prev, accessKeyId: e.target.value }))} />
            <Input type="password" label="Secret access key" placeholder="secret access key" value={awsForm.secretAccessKey} onChange={e => setAwsForm(prev => ({ ...prev, secretAccessKey: e.target.value }))} />
          </div>
          <Input label="Region" placeholder="us-east-1" value={awsForm.region} onChange={e => setAwsForm(prev => ({ ...prev, region: e.target.value }))} style={{ maxWidth: '220px' }} />
          <Button onClick={() => { saveAWS.mutate(awsForm); toast('AWS settings saved', 'success') }} disabled={saveAWS.isPending}>
            {saveAWS.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save
          </Button>
        </div>
      </Card>
    </div>
  )
}

function AuditView({ data, isLoading }: { data: any[]; isLoading: boolean }) {
  if (isLoading) return <Card><Skeleton className="h-40" /></Card>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Audit log</h2>
        </CardHeader>
        <div className="table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-[var(--color-text-secondary)]">No activity recorded yet.</TableCell>
                </TableRow>
              ) : (
                data?.map((ev: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-[var(--color-text-muted)] text-sm">{timeAgo(ev.ts)}</TableCell>
                    <TableCell className="font-medium">{ev.actor}</TableCell>
                    <TableCell><code className="text-sm font-mono text-[var(--color-text)]">{ev.action}</code></TableCell>
                    <TableCell><Badge variant={ev.result === 'success' ? 'success' : 'danger'}>{ev.result}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}