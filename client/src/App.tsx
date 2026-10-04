'use client'

import * as React from 'react'
import { Activity, ArrowLeft, ArrowRight, LayoutDashboard, FolderGit2, Server, History, Settings, Menu, LogOut, Sun, Moon, Plus, ExternalLink, RefreshCw, Trash2, Key, Zap, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Label } from '@/components/ui/Label'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/DropdownMenu'
import { useToast } from '@/components/ui/Toaster'
import { 
  useAuthStatus,
  useCreateOwner,
  useLogin,
  useLogout,
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
  useTestAWS,
  useAudit,
  useProjectDetail,
  useTriggerDeploy,
  useRollbackProject,
  useRestartContainer,
  useProjectLogs,
  useProjectSecrets,
  useUpdateProjectSettings,
  useDeleteProject,
  useToggleWebhook
} from '@/api/queries'
import { ReleasesTab } from '@/components/ProjectDetail/ReleasesTab'
import { timeAgo } from '@/lib/utils'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'audit', label: 'Audit log', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

type ViewId = typeof NAV_ITEMS[number]['id'] | 'project-detail'

function HealthPill({ state }: { state: 'healthy' | 'attention' | 'critical' }) {
  const variants = {
    healthy: 'success' as const,
    attention: 'warning' as const,
    critical: 'danger' as const,
  }
  return <Badge variant={variants[state]}>{state.charAt(0).toUpperCase() + state.slice(1)}</Badge>
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
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark'
    const saved = localStorage.getItem('forge-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [currentProjectId, setCurrentProjectId] = React.useState<string | null>(null)
  const { toast } = useToast()

  const authStatus = useAuthStatus()
  const createOwner = useCreateOwner()
  const login = useLogin()
  const logout = useLogout()
  const isAuthenticated = Boolean(authStatus.data?.user)
  const dashboardQuery = useDashboard(isAuthenticated)
  const { data: dashboard, isLoading: dashboardLoading } = dashboardQuery
  const { data: projects, isLoading: projectsLoading } = useProjects(isAuthenticated)
  const createProject = useCreateProject()
  const { data: servers, isLoading: serversLoading } = useServers(isAuthenticated)
  const connectServer = useConnectServer()
  const provisionServer = useProvisionServer()
  const testServer = useTestServer()
  const deleteServer = useDeleteServer()
  const { data: settings, isLoading: settingsLoading } = useSettings(isAuthenticated)
  const connectGitHub = useConnectGitHub()
  const disconnectGitHub = useDisconnectGitHub()
  const saveAWS = useSaveAWS()
  const testAWS = useTestAWS()
  const { data: audit, isLoading: auditLoading } = useAudit(isAuthenticated)

  React.useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('forge-theme', next)
    document.documentElement.classList.toggle('light', next === 'light')
  }

  const openProject = (projectId: string) => {
    setCurrentProjectId(projectId)
    setCurrentView('project-detail')
    setSidebarOpen(false)
  }

  const backToProjects = () => {
    setCurrentProjectId(null)
    setCurrentView('projects')
    setSidebarOpen(false)
  }

  if (authStatus.isLoading) return <StartupScreen />
  if (authStatus.isError) {
    return <StartupError message={authStatus.error.message} onRetry={() => authStatus.refetch()} />
  }
  if (!isAuthenticated) {
    return (
      <AuthScreen
        needsSetup={authStatus.data?.needsSetup ?? false}
        isPending={createOwner.isPending || login.isPending}
        onSubmit={(credentials) =>
          authStatus.data?.needsSetup
            ? createOwner.mutateAsync(credentials)
            : login.mutateAsync(credentials)
        }
      />
    )
  }

  const renderView = () => {
    if (currentView === 'project-detail' && currentProjectId) {
      return <ProjectDetailView projectId={currentProjectId} servers={servers ?? []} onBack={backToProjects} />
    }
    switch (currentView) {
      case 'dashboard':
        return <DashboardView data={dashboard} isLoading={dashboardLoading} userName={authStatus.data?.user?.username ?? ''} onOpenProjects={() => setCurrentView('projects')} error={dashboardQuery.error} onRetry={() => dashboardQuery.refetch()} />
      case 'projects':
        return <ProjectsView projects={projects ?? []} isLoading={projectsLoading} createProject={createProject} onOpenProject={openProject} />
      case 'servers':
        return <ServersView servers={servers ?? []} isLoading={serversLoading} connectServer={connectServer} provisionServer={provisionServer} testServer={testServer} deleteServer={deleteServer} />
      case 'audit':
        return <AuditView data={audit ?? []} isLoading={auditLoading} />
      case 'settings':
        return <SettingsView settings={settings} isLoading={settingsLoading} connectGitHub={connectGitHub} disconnectGitHub={disconnectGitHub} saveAWS={saveAWS} testAWS={testAWS} />
      default:
        return <DashboardView data={dashboard} isLoading={dashboardLoading} userName={authStatus.data?.user?.username ?? ''} onOpenProjects={() => setCurrentView('projects')} error={dashboardQuery.error} onRetry={() => dashboardQuery.refetch()} />
    }
  }

  return (
    <div className="app-shell min-h-screen flex">
      <aside
        className={cn(
          'sidebar w-55 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col p-4 gap-1 fixed inset-y-0 left-0 z-50 transform transition-transform duration-180',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:z-20',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
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
              aria-current={currentView === item.id || (currentView === 'project-detail' && item.id === 'projects') ? 'page' : undefined}
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
            onClick={() => logout.mutate(undefined, { onError: (error) => toast(error.message, 'error') })}
            disabled={logout.isPending}
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
              <strong className="text-[var(--color-text)] font-semibold">{currentView === 'project-detail' ? 'Projects / Detail' : NAV_ITEMS.find((item) => item.id === currentView)?.label ?? 'Dashboard'}</strong>
            </div>
          </div>
          <div className="topbar-actions flex items-center gap-2">
            <Badge variant="neutral">{authStatus.data?.user?.username}</Badge>
          </div>
        </header>

        <main className="content flex-1 p-6 container-type inline-size overflow-y-auto">
          {renderView()}
        </main>
      </div>
    </div>
  )
}

function StartupScreen() {
  return (
    <main className="startup-screen" aria-label="Loading Forge">
      <span className="mark" />
      <Loader2 className="startup-spinner" aria-hidden="true" />
    </main>
  )
}

function StartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="startup-screen">
      <section className="startup-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <h1>Forge could not connect</h1>
        <p>{message}</p>
        <Button onClick={onRetry}>Retry</Button>
      </section>
    </main>
  )
}

function AuthScreen({
  needsSetup,
  isPending,
  onSubmit,
}: {
  needsSetup: boolean
  isPending: boolean
  onSubmit: (credentials: { username: string; password: string }) => Promise<unknown>
}) {
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      await onSubmit({ username: username.trim(), password })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed.')
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-layout">
        <section className="auth-aside" aria-label="Forge">
          <div className="sidebar-brand">
            <span className="mark" />
            Forge
          </div>
          <div className="auth-aside-center">
            <p className="auth-kicker"><Activity aria-hidden="true" /> CONTROL PLANE</p>
            <h1>Own your<br />infrastructure.</h1>
            <div className="auth-status"><span className="status-light" /> SELF-HOSTED WORKSPACE</div>
          </div>
          <div className="auth-aside-footer"><span>FORGE / AWS</span><span>v0.1.0</span></div>
        </section>

        <section className="auth-panel">
          <div>
            <p className="auth-kicker">{needsSetup ? 'FIRST RUN' : 'OWNER ACCESS'}</p>
            <h2>{needsSetup ? 'Create your account' : 'Welcome back'}</h2>
            <p className="auth-subtitle">
              {needsSetup
                ? 'Set up the owner account for this Forge instance.'
                : 'Sign in to continue to your workspace.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <Input
              autoComplete="username"
              label="Username"
              name="username"
              minLength={3}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <Input
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              label="Password"
              name="password"
              type="password"
              minLength={needsSetup ? 10 : 1}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {needsSetup && <p className="auth-hint">Use at least 10 characters.</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Button type="submit" disabled={isPending} className="auth-submit">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {needsSetup ? 'Create owner account' : 'Sign in'}
              {!isPending && <ArrowRight className="w-4 h-4" />}
            </Button>
          </form>
          <p className="auth-panel-footer">Private by design. Your credentials stay on this instance.</p>
        </section>
      </div>
    </main>
  )
}

function DashboardView({ data, isLoading, userName, onOpenProjects, error, onRetry }: {
  data: any
  isLoading: boolean
  userName: string
  onOpenProjects: () => void
  error?: Error | null
  onRetry: () => void
}) {
  if (isLoading) {
    return (
      <div className="dashboard-view" aria-busy="true">
        <header className="page-heading">
          <div><p className="page-kicker">OPERATIONS / OVERVIEW</p><Skeleton className="h-8 w-40" /></div>
        </header>
        <Skeleton className="h-24 rounded-[var(--radius)]" />
        <div className="dashboard-metrics">
          {[1, 2, 3].map((index) => <Skeleton key={index} className="h-28 rounded-[var(--radius)]" />)}
        </div>
        <Skeleton className="mt-8 h-44" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="startup-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <h2>Overview unavailable</h2>
        <p>{error?.message || 'Forge could not load the latest system status.'}</p>
        <Button variant="subtle" onClick={onRetry}>Retry</Button>
      </div>
    )
  }

  const statusLabel = data.overall === 'healthy'
    ? 'Systems nominal'
    : data.overall === 'attention'
      ? 'Needs attention'
      : 'Critical issue'
  const openIncidentCount = data.openIncidents?.length ?? 0
  const statusDescription = openIncidentCount > 0
    ? `${openIncidentCount} open incident${openIncidentCount === 1 ? '' : 's'} require review.`
    : data.projectCount === 0
      ? 'Control plane ready. Add a project to begin.'
      : 'No active incidents. Your latest checks are clear.'
  const components = Object.entries(data.components || {}) as [string, string][]
  const metrics = [
    { label: 'Projects', value: data.projectCount, detail: 'Tracked applications', icon: FolderGit2 },
    { label: 'Servers', value: data.serverCount, detail: 'Connected environments', icon: Server },
    { label: 'Open incidents', value: openIncidentCount, detail: openIncidentCount ? 'Requires review' : 'No action required', icon: AlertTriangle },
  ]

  return (
    <div className="dashboard-view">
      <header className="page-heading">
        <div>
          <p className="page-kicker">OPERATIONS / OVERVIEW</p>
          <h1 className="page-title">Overview</h1>
          <p className="page-description">Workspace for {userName}</p>
        </div>
        <Button onClick={onOpenProjects}><Plus className="w-4 h-4" /> New project</Button>
      </header>

      <section className={cn('system-banner', `state-${data.overall}`)} aria-live="polite">
        <div className="system-state-icon"><Activity className="w-5 h-5" aria-hidden="true" /></div>
        <div>
          <p className="section-kicker">PLATFORM STATUS</p>
          <h2>{statusLabel}</h2>
          <p>{statusDescription}</p>
        </div>
        <div className="component-status-list">
          {components.map(([name, state]) => (
            <span className="component-status" data-state={state} key={name}>{name}</span>
          ))}
        </div>
      </section>

      <section aria-labelledby="environment-heading">
        <div className="section-heading">
          <h2 id="environment-heading">Environment</h2>
          <p>Live inventory</p>
        </div>
        <div className="dashboard-metrics">
          {metrics.map(({ label, value, detail, icon: Icon }) => (
            <div className="dashboard-metric" key={label}>
              <div className="metric-topline"><Icon aria-hidden="true" /><span>{detail}</span></div>
              <strong className="metric-value">{String(value ?? 0).padStart(2, '0')}</strong>
              <span className="metric-label">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="activity-section" aria-labelledby="activity-heading">
        <div className="section-heading">
          <h2 id="activity-heading">Recent activity</h2>
          <p>Latest control-plane events</p>
        </div>
        {data.recentActivity?.length ? (
          <>
            <div className="activity-row activity-header"><span>ACTOR</span><span>EVENT</span><span>WHEN</span></div>
            {data.recentActivity.map((entry: any, index: number) => (
              <div className="activity-row" key={`${entry.ts}-${index}`}>
                <span className="activity-actor">{entry.actor}</span>
                <span className="activity-action">{entry.action.replace(/\./g, ' / ')}</span>
                <span className="activity-time">{timeAgo(entry.ts)}</span>
              </div>
            ))}
          </>
        ) : (
          <p className="activity-empty">No activity recorded yet.</p>
        )}
      </section>
    </div>
  )
}

function ProjectsView({ projects, isLoading, createProject, onOpenProject }: { projects: any[]; isLoading: boolean; createProject: any; onOpenProject: (id: string) => void }) {
  const { toast } = useToast()
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
  const [_loadingDetect, setLoadingDetect] = React.useState(false)

  const { data: servers } = useServers()

  const handleRepoChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const repoFullName = e.target.value
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

  const handleBranchChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const branch = e.target.value
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
                <TableRow key={p.id} onClick={() => onOpenProject(p.id)} className="cursor-pointer hover:bg-[var(--color-surface-raised)]">
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-sm text-[var(--color-text-muted)] font-mono">{p.repoFullName}</TableCell>
                  <TableCell>{p.branch}</TableCell>
                  <TableCell><HealthPill state={p.health} /></TableCell>
                  <TableCell className="text-sm text-[var(--color-text-muted)]">{p.lastDeployedAt ? timeAgo(p.lastDeployedAt) : 'Never'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); onOpenProject(p.id); }}>Open</Button>
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
                    <Select value={formData.repoFullName} onChange={handleRepoChange}>
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
                    <Select value={formData.branch} onChange={handleBranchChange} disabled={!formData.repoFullName || loadingBranches}>
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
                  <Select value={formData.serverId} onChange={e => setFormData(prev => ({ ...prev, serverId: e.target.value }))} required>
                    <option value="">Select a server…</option>
                    {servers?.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={formData.autoHeal} onChange={e => setFormData(prev => ({ ...prev, autoHeal: e.target.checked }))} />
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
 
function ProjectDetailView({ projectId, servers, onBack }: { projectId: string; servers: any[]; onBack: () => void }) {
  const [currentTab, setCurrentTab] = React.useState<'releases' | 'logs' | 'secrets' | 'settings'>('releases')
  const { toast } = useToast()
  
  const { data: projectData, isLoading } = useProjectDetail(projectId)
  const project = projectData?.project
  
  const deployMutation = useTriggerDeploy(projectId)
  const rollbackMutation = useRollbackProject(projectId)
  const restartMutation = useRestartContainer(projectId)
  const { query: secretsQuery, add: addSecret, remove: removeSecret } = useProjectSecrets(projectId)
  const updateMutation = useUpdateProjectSettings(projectId)
  const deleteMutation = useDeleteProject()
  const toggleAutoDeployMutation = useToggleWebhook(projectId)
  
  const handleDeploy = async () => {
    try {
      await deployMutation.mutateAsync()
      toast('Deployment started', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  
  const handleRollback = async (_deploymentId: string) => {
    try {
      await rollbackMutation.mutateAsync(_deploymentId)
      toast('Rollback started', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  
  const handleRestart = async () => {
    try {
      await restartMutation.mutateAsync()
      toast('Container restarted', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  
  const handleAddSecret = async (key: string, value: string) => {
    try {
      await addSecret.mutateAsync({ key, value })
      toast('Secret added. Redeploy to apply.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  
  const handleRemoveSecret = async (key: string) => {
    try {
      await removeSecret.mutateAsync(key)
      toast('Secret removed. Redeploy to apply.', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  
  const handleUpdateSettings = async (data: any) => {
    try {
      await updateMutation.mutateAsync(data)
      toast('Settings saved', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  
  const handleDeleteProject = async () => {
    try {
      await deleteMutation.mutateAsync(projectId)
      toast('Project deleted', 'success')
      onBack()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  
  const handleToggleAutoDeploy = async (enable: boolean) => {
    try {
      await toggleAutoDeployMutation.mutateAsync(enable)
      toast(enable ? 'Auto-deploy enabled' : 'Auto-deploy disabled', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
 
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="health-hero rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-7 h-32" />
        <Skeleton className="h-40" />
      </div>
    )
  }
 
  if (!project) return null
 
  const latestDeployment = project.currentDeployment
  const isBuilding = latestDeployment?.status === 'building'
 
  return (
    <div className="space-y-4">
      <div className="detail-back-row">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /> Projects</Button>
      </div>
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{project.name}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] font-mono mt-1">
              {project.repoFullName} @ {project.branch} → {project.hostPort ? ':' + project.hostPort : '—'}
            </p>
          </div>
          <div className="inline-row items-center gap-3">
            <HealthPill state={project.health} />
            <Button onClick={handleDeploy} disabled={deployMutation.isPending || isBuilding}>
              {deployMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Deploy
            </Button>
          </div>
        </CardHeader>
      </Card>
 
      <Tabs value={currentTab} onValueChange={(value: string) => setCurrentTab(value as 'releases' | 'logs' | 'secrets' | 'settings')}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="releases">Releases</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="secrets">Secrets</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
 
        <TabsContent value="releases" className="mt-4">
          <ReleasesTab 
            project={project} 
            latestDeployment={latestDeployment}
            isBuilding={isBuilding}
            onRollback={handleRollback}
          />
        </TabsContent>
 
        <TabsContent value="logs" className="mt-4">
          <LogsTab projectId={projectId} onRestart={handleRestart} />
        </TabsContent>
 
        <TabsContent value="secrets" className="mt-4">
          <SecretsTab 
            projectId={projectId} 
            secrets={secretsQuery.data?.keys || []}
            isLoading={secretsQuery.isLoading}
            onAdd={handleAddSecret}
            onRemove={handleRemoveSecret}
          />
        </TabsContent>
 
        <TabsContent value="settings" className="mt-4">
          <SettingsTab 
            project={project}
            servers={servers}
            onUpdate={handleUpdateSettings}
            onDelete={handleDeleteProject}
            onToggleAutoDeploy={handleToggleAutoDeploy}
            autoDeploy={project.autoDeploy}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
 
function LogsTab({ projectId, onRestart }: any) {
  const { data, isLoading, refetch } = useProjectLogs(projectId)
 
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onRestart}><RefreshCw className="w-4 h-4 mr-1" /> Restart container</Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>Refresh</Button>
        </div>
      </div>
      <pre className="log-pane text-sm">
        {isLoading ? 'Loading…' : data?.logs || '(empty)'}
      </pre>
    </Card>
  )
}
 
function SecretsTab({ secrets, isLoading, onAdd, onRemove }: any) {
  const { toast } = useToast()
  const [key, setKey] = React.useState('')
  const [value, setValue] = React.useState('')
 
  return (
    <Card>
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        Values are encrypted at rest and never shown again after saving. Redeploy to pick up changes.
      </p>
      {isLoading ? (
        <Skeleton className="h-20" />
      ) : secrets.length === 0 ? (
        <p className="text-[var(--color-text-secondary)] text-sm">No environment variables set.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {secrets.map((k: string) => (
            <div key={k} className="inline-row items-center justify-between p-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
              <span className="font-mono text-sm">{k} = <span className="text-[var(--color-text-muted)]">••••••••</span></span>
              <Button variant="ghost" size="sm" onClick={() => { onRemove(k); toast('Removed. Redeploy to apply.', 'success') }}>Remove</Button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); onAdd(key, value); setKey(''); setValue(''); }} className="grid grid-cols-2 gap-3">
        <Input placeholder="DATABASE_URL" value={key} onChange={e => setKey(e.target.value)} required />
        <Input type="password" placeholder="value" value={value} onChange={e => setValue(e.target.value)} required />
        <Button className="col-span-2" type="submit">Save</Button>
      </form>
    </Card>
  )
}
 
function SettingsTab({ project, servers, onUpdate, onDelete, onToggleAutoDeploy, autoDeploy }: any) {
  const [formData, setFormData] = React.useState({
    branch: project.branch,
    serverId: project.serverId || '',
    port: project.port || 8080,
    hostPort: project.hostPort || 8080,
    healthPath: project.healthPath || '/health',
    autoHeal: project.autoHeal || false,
  })
 
  return (
    <Card>
      <form onSubmit={e => { e.preventDefault(); onUpdate(formData); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Branch</Label>
            <Input value={formData.branch} onChange={e => setFormData(prev => ({ ...prev, branch: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Server</Label>
            <Select value={formData.serverId} onChange={e => setFormData(prev => ({ ...prev, serverId: e.target.value }))} required>
              <option value="">—</option>
              {servers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
            </Select>
          </div>
        </div>
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
        <div className="flex items-center gap-2">
          <Switch checked={formData.autoHeal} onChange={e => setFormData(prev => ({ ...prev, autoHeal: e.target.checked }))} />
          <Label>Auto-restart on repeated health-check failure</Label>
        </div>
        <Button type="submit">Save settings</Button>
      </form>
 
      <hr className="border-[var(--color-border)] my-4" />
 
      <div className="flex items-center justify-between">
        <div>
          <p>{autoDeploy ? 'Auto-deploy is on' : 'Auto-deploy is off'}</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Pushes to "{project.branch}" {autoDeploy ? 'trigger a deploy automatically.' : 'require a manual Deploy click.'}
          </p>
        </div>
        <Button variant={autoDeploy ? 'subtle' : 'primary'} size="sm" onClick={() => onToggleAutoDeploy(!autoDeploy)}>
          {autoDeploy ? 'Disable' : 'Enable'}
        </Button>
      </div>
 
      <hr className="border-[var(--color-border)] my-4" />
 
      <div className="text-red-400">
        <Button variant="danger" onClick={onDelete}>Delete project</Button>
        <p className="text-xs text-[var(--color-text-muted)] mt-2">
          This removes the project from Forge and its release history. The running container on the server is left as-is — stop it manually if needed.
        </p>
      </div>
    </Card>
  )
}
 
function ServersView({ servers, isLoading, connectServer, provisionServer, testServer, deleteServer }: any) {
  const { toast } = useToast()
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
            <Select label="Instance type" value={provisionForm.instanceType} onChange={e => setProvisionForm(prev => ({ ...prev, instanceType: e.target.value }))}>
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

function SettingsView({ settings, isLoading, connectGitHub, disconnectGitHub, saveAWS, testAWS }: any) {
  const { toast } = useToast()
  const [githubToken, setGithubToken] = React.useState('')
  const [awsForm, setAwsForm] = React.useState({ accessKeyId: '', secretAccessKey: '', region: '' })

  if (isLoading) return <Card><Skeleton className="h-40" /></Card>

  const handleConnectGitHub = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await connectGitHub.mutateAsync(githubToken)
      setGithubToken('')
      toast('GitHub connected', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not connect GitHub.', 'error')
    }
  }

  const handleDisconnectGitHub = async () => {
    try {
      await disconnectGitHub.mutateAsync()
      toast('GitHub disconnected', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not disconnect GitHub.', 'error')
    }
  }

  const handleSaveAWS = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await saveAWS.mutateAsync(awsForm)
      toast('AWS settings saved', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save AWS settings.', 'error')
    }
  }

  const handleTestAWS = async () => {
    try {
      await testAWS.mutateAsync()
      toast(settings?.aws?.endpoint ? 'Local EC2 API is reachable' : 'AWS EC2 connection succeeded', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not reach the EC2 API.', 'error')
    }
  }

  return (
    <div className="settings-page">
      <header className="page-heading">
        <div>
          <p className="page-kicker">CONFIGURATION</p>
          <h1 className="page-title">Settings</h1>
          <p className="page-description">Connections for source control and infrastructure.</p>
        </div>
      </header>
      <div className="settings-grid">
        <Card className="settings-card">
          <CardHeader>
            <div>
              <p className="section-kicker">SOURCE CONTROL</p>
              <h2 className="text-base font-semibold">GitHub</h2>
            </div>
            {settings?.github?.connected && <Badge variant="success">connected</Badge>}
          </CardHeader>
          {settings?.github?.connected ? (
            <div className="connection-row">
              <p>Connected as <strong>{settings.github.login}</strong></p>
              <Button variant="danger" size="sm" onClick={handleDisconnectGitHub} disabled={disconnectGitHub.isPending}>
                {disconnectGitHub.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Disconnect
              </Button>
            </div>
          ) : (
            <form className="settings-form" onSubmit={handleConnectGitHub}>
              <p className="text-[var(--color-text-secondary)]">Connect an account to browse repositories and manage deployments.</p>
              <Input
                label="Personal access token"
                name="github-token"
                type="password"
                autoComplete="off"
                placeholder="github_pat_..."
                value={githubToken}
                onChange={(event) => setGithubToken(event.target.value)}
                required
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={connectGitHub.isPending || !githubToken}>
                  {connectGitHub.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
                </Button>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">Grant repository access to the repositories Forge should manage.</p>
            </form>
          )}
        </Card>

        <Card className="settings-card">
          <CardHeader>
            <div>
              <p className="section-kicker">COMPUTE PROVIDER</p>
              <h2 className="text-base font-semibold">AWS</h2>
            </div>
            {settings?.aws?.endpoint && <Badge variant="warning">local endpoint</Badge>}
          </CardHeader>
          {settings?.aws?.endpoint ? (
            <div className="local-endpoint" role="status">
              <span className="status-light" />
              <div><span>EC2 API endpoint</span><code>{settings.aws.endpoint}</code></div>
            </div>
          ) : settings?.aws?.usingInstanceProfile ? (
            <p className="text-[var(--color-text-secondary)]">Using this box's own EC2 instance profile for AWS access.</p>
          ) : settings?.aws?.configured ? (
            <p className="text-[var(--color-text-secondary)]">Configured for region <strong>{settings.aws.region}</strong>.</p>
          ) : (
            <p className="text-[var(--color-text-secondary)]">Add AWS credentials or attach an EC2 instance profile to this host to provision servers.</p>
          )}
          <form className="settings-form" onSubmit={handleSaveAWS}>
            <div className="settings-form-grid">
              <Input label="Access key ID" name="awsAccessKeyId" autoComplete="off" placeholder="AKIA..." value={awsForm.accessKeyId} onChange={event => setAwsForm(prev => ({ ...prev, accessKeyId: event.target.value }))} />
              <Input label="Secret access key" name="awsSecretAccessKey" autoComplete="new-password" type="password" placeholder="Secret access key" value={awsForm.secretAccessKey} onChange={event => setAwsForm(prev => ({ ...prev, secretAccessKey: event.target.value }))} />
            </div>
            <Input label="Region" name="awsRegion" placeholder={settings?.aws?.region || 'us-east-1'} value={awsForm.region} onChange={event => setAwsForm(prev => ({ ...prev, region: event.target.value }))} />
            <div className="settings-actions">
              <Button type="button" variant="subtle" onClick={handleTestAWS} disabled={testAWS.isPending}>
                {testAWS.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                Test EC2 connection
              </Button>
              <Button type="submit" disabled={saveAWS.isPending}>
                {saveAWS.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Save credentials
              </Button>
            </div>
          </form>
        </Card>
      </div>
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