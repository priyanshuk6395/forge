// client/src/api/queries.ts
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from './client'
import type {
  DashboardData,
  Project,
  ProjectDetail,
  Deployment,
  Server,
  ServerTelemetry,
  SettingsData,
  AuditEvent,
  NewProjectForm,
  GitHubRepo,
  GitHubDetect,
  ConnectServerForm,
  ProvisionServerForm,
  SecretForm,
  ProjectSettingsForm,
} from './types'

type ProjectResponse = Omit<Project, 'health'> & {
  health: unknown
  currentDeploymentId?: string | null
}

function normalizeHealth(value: unknown): Project['health'] {
  const state =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'state' in value
        ? value.state
        : undefined

  if (state === 'healthy') return 'healthy'
  if (state === 'critical' || state === 'unhealthy') return 'critical'
  if (state === 'attention') return 'attention'
  return 'unknown'
}

function normalizeProject(project: ProjectResponse): Project {
  return { ...project, health: normalizeHealth(project.health) }
}

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: () =>
      api.get<{
        needsSetup: boolean
        user: { id: string; username: string; role: string } | null
      }>('/auth/status'),
    staleTime: 60_000,
  })
}

export function useCreateOwner() {
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      api.post('/auth/setup', credentials),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth'] }),
  })
}

export function useLogin() {
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      api.post('/auth/login', credentials),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth'] }),
  })
}

export function useLogout() {
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('/auth/logout', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth'] }),
  })
}

export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardData> => {
      const response = await api.get<Partial<DashboardData>>('/dashboard')
      const applicationDetailsAvailable = Array.isArray(response.applications)
      const projectCountAvailable = typeof response.projectCount === 'number'
      const applications = Array.isArray(response.applications) ? response.applications : []

      return {
        ...response,
        generatedAt: response.generatedAt ?? new Date().toISOString(),
        overall: response.overall ?? 'unknown',
        components: response.components ?? {},
        projectCount: response.projectCount ?? applications.length,
        projectCountAvailable,
        serverCount: response.serverCount ?? 0,
        applications,
        applicationDetailsAvailable,
        openIncidents: Array.isArray(response.openIncidents) ? response.openIncidents : [],
        recentActivity: Array.isArray(response.recentActivity) ? response.recentActivity : [],
      } satisfies DashboardData
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useProjects(enabled = true) {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { projects } = await api.get<{ projects: ProjectResponse[] }>('/projects')
      return projects.map(normalizeProject)
    },
    enabled,
    staleTime: 30_000,
  })
}

export function useProjectDetail(projectId: string | null) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const [detail, secrets] = await Promise.all([
        api.get<{ project: ProjectResponse; deployments: Deployment[] }>(`/projects/${projectId}`),
        api.get<{ keys: string[] }>(`/projects/${projectId}/secrets`),
      ])
      const deployments = detail.deployments
      const currentDeployment =
        deployments.find((deployment) => deployment.id === detail.project.currentDeploymentId) ||
        deployments[0] ||
        null

      return {
        project: {
          ...normalizeProject(detail.project),
          currentDeployment,
          deployments,
          secrets,
        },
      } satisfies ProjectDetail
    },
    enabled: !!projectId,
    staleTime: 15_000,
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.project?.currentDeployment?.status
      const latestStatus = query.state.data?.project?.deployments?.[0]?.status
      return currentStatus === 'building' || latestStatus === 'building' ? 1800 : false
    },
    refetchIntervalInBackground: true,
  })
}

export function useProjectLogs(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['project-logs', projectId],
    queryFn: () => api.get<{ logs: string }>(`/projects/${projectId}/logs?lines=300`),
    enabled: !!projectId && enabled,
    refetchInterval: 5000,
  })
}

export function useServers(enabled = true) {
  return useQuery({
    queryKey: ['servers'],
    queryFn: async () => (await api.get<{ servers: Server[] }>('/servers')).servers,
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const list = query.state.data || []
      return list.some((s) => s.status === 'connecting' || s.status === 'provisioning')
        ? 4000
        : list.some((server) => server.agent?.state === 'ready' || server.agent?.state === 'stale')
          ? 60_000
          : false
    },
  })
}

export function useServerTelemetry(serverId: string | null) {
  return useQuery({
    queryKey: ['server-telemetry', serverId],
    queryFn: async () =>
      (await api.get<{ telemetry: ServerTelemetry }>(`/servers/${serverId}/telemetry`)).telemetry,
    enabled: !!serverId,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  })
}

export function useInstallServerAgent() {
  return useMutation({
    mutationFn: (serverId: string) =>
      api.post<{ server: Server; telemetry: ServerTelemetry }>(`/servers/${serverId}/agent/install`, {}),
    onSuccess: ({ server, telemetry }) => {
      queryClient.setQueryData<Server[]>(['servers'], (current) =>
        current?.map((item) => item.id === server.id ? { ...item, ...server } : item)
      )
      queryClient.setQueryData(['server-telemetry', server.id], telemetry)
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsData>('/settings'),
    enabled,
    staleTime: 60_000,
  })
}

export function useAudit(enabled = true) {
  return useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await api.get<{ events: AuditEvent[] }>('/audit')).events,
    enabled,
    staleTime: 60_000,
  })
}

export function useGitHubRepos(enabled = false) {
  return useQuery({
    queryKey: ['github-repos'],
    queryFn: fetchGitHubRepos,
    enabled,
  })
}

export function useGitHubBranches(repoFullName: string) {
  return useQuery({
    queryKey: ['github-branches', repoFullName],
    queryFn: () => {
      const [owner, repo] = repoFullName.split('/')
      return fetchGitHubBranches(owner, repo)
    },
    enabled: !!repoFullName,
  })
}

export function useGitHubDetect(repoFullName: string, branch: string) {
  return useQuery({
    queryKey: ['github-detect', repoFullName, branch],
    queryFn: () => {
      const [owner, repo] = repoFullName.split('/')
      return fetchGitHubDetect(owner, repo, branch)
    },
    enabled: !!repoFullName && !!branch,
  })
}

export async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  return (await api.get<{ repos: GitHubRepo[] }>('/github/repos')).repos
}

export async function fetchGitHubBranches(owner: string, repo: string): Promise<string[]> {
  return (
    await api.get<{ branches: string[] }>(
      `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`
    )
  ).branches
}

export function fetchGitHubDetect(owner: string, repo: string, branch: string) {
  return api.get<GitHubDetect>(
    `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/detect?branch=${encodeURIComponent(branch)}`
  )
}

export function useCreateProject() {
  return useMutation({
    mutationFn: (form: NewProjectForm) => api.post<{ project: Project }>('/projects', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useTriggerDeploy(projectId: string) {
  return useMutation({
    mutationFn: () => api.post<{ deployment: Deployment }>(`/projects/${projectId}/deploy`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useRollbackProject(projectId: string) {
  return useMutation({
    mutationFn: (deploymentId: string) =>
      api.post<{ deployment: Deployment }>(`/projects/${projectId}/deployments/${deploymentId}/rollback`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useRestartContainer(projectId: string) {
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>(`/projects/${projectId}/restart`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-logs', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useSaveSecret(projectId: string) {
  return useMutation({
    mutationFn: (secret: SecretForm) =>
      api.put<{ keys: string[] }>(`/projects/${projectId}/secrets`, secret),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-secrets', projectId] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useDeleteSecret(projectId: string) {
  return useMutation({
    mutationFn: (key: string) =>
      api.delete<{ keys: string[] }>(`/projects/${projectId}/secrets/${encodeURIComponent(key)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-secrets', projectId] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useProjectSecrets(projectId: string) {
  const query = useQuery({
    queryKey: ['project-secrets', projectId],
    queryFn: () => api.get<{ keys: string[] }>(`/projects/${projectId}/secrets`),
    enabled: !!projectId,
  })

  return {
    query,
    add: useSaveSecret(projectId),
    remove: useDeleteSecret(projectId),
  }
}

export function useUpdateProjectSettings(projectId: string) {
  return useMutation({
    mutationFn: (settings: Partial<ProjectSettingsForm>) =>
      api.patch<{ project: Project }>(`/projects/${projectId}`, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useToggleWebhook(projectId: string) {
  return useMutation({
    mutationFn: (enable: boolean) =>
      enable
        ? api.post(`/projects/${projectId}/webhook`, {})
        : api.delete(`/projects/${projectId}/webhook`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useConnectGitHub() {
  return useMutation({
    mutationFn: (token: string) => api.post<{ connected: boolean; login: string }>('/settings/github', { token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['github-repos'] })
    },
  })
}

export function useDisconnectGitHub() {
  return useMutation({
    mutationFn: () => api.delete<{ ok: boolean }>('/settings/github'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['github-repos'] })
    },
  })
}

export function useSaveAWS() {
  return useMutation({
    mutationFn: (settings: { accessKeyId: string; secretAccessKey: string; region: string }) =>
      api.post<{ ok: boolean; configured: boolean }>('/settings/aws', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useTestAWS() {
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('/settings/aws/test', {}),
  })
}

export function useDeleteProject() {
  return useMutation({
    mutationFn: (projectId: string) =>
      api.delete(`/projects/${projectId}`, { confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useConnectServer() {
  return useMutation({
    mutationFn: (form: ConnectServerForm) => api.post<{ server: Server }>('/servers/connect', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useProvisionServer() {
  return useMutation({
    mutationFn: (form: ProvisionServerForm) => api.post<{ server: Server }>('/servers/provision', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useTestServer() {
  return useMutation({
    mutationFn: (serverId: string) =>
      api.post<{ ok?: boolean; success?: boolean; error?: string }>(`/servers/${serverId}/test`, {}),
  })
}

export function useDeleteServer() {
  return useMutation({
    mutationFn: (serverId: string) =>
      api.delete(`/servers/${serverId}`, { confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}