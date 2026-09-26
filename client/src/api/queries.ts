import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type {
  DashboardData,
  Project,
  ProjectDetail,
  Server,
  SettingsData,
  AuditEvent,
  NewProjectForm,
  GitHubRepo,
  GitHubBranch,
  GitHubDetect,
  ConnectServerForm,
  ProvisionServerForm,
  SecretForm,
  ProjectSettingsForm,
} from './types'

// Dashboard
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
    refetchInterval: 60_000,
  })
}

// Projects
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/projects'),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: NewProjectForm) => api.post<{ project: Project }>('/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<ProjectDetail>(`/projects/${projectId}`),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.project.currentDeployment?.status === 'building') return 1800
      return false
    },
  })
}

export function useDeployProject(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ deployment: { number: number; id: string } }>(`/projects/${projectId}/deploy`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useRollbackDeployment(projectId: string, deploymentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ deployment: { number: number; id: string } }>(`/projects/${projectId}/deployments/${deploymentId}/rollback`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useRestartContainer(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<void>(`/projects/${projectId}/restart`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useProjectLogs(projectId: string) {
  return useQuery({
    queryKey: ['logs', projectId],
    queryFn: () => api.get<{ logs: string }>(`/projects/${projectId}/logs?lines=300`),
    refetchInterval: false,
  })
}

export function useProjectSecrets(projectId: string) {
  const qc = useQueryClient()
  return {
    query: useQuery({
      queryKey: ['secrets', projectId],
      queryFn: () => api.get<{ keys: string[] }>(`/projects/${projectId}/secrets`),
    }),
    add: useMutation({
      mutationFn: (data: SecretForm) => api.put<{ keys: string[] }>(`/projects/${projectId}/secrets`, data),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['secrets', projectId] }),
    }),
    remove: useMutation({
      mutationFn: (key: string) => api.delete<void>(`/projects/${projectId}/secrets/${encodeURIComponent(key)}`),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['secrets', projectId] }),
    }),
  }
}

export function useUpdateProject(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProjectSettingsForm) => api.patch<void>(`/projects/${projectId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })
}

export function useDeleteProject(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<void>(`/projects/${projectId}`, { confirm: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.removeQueries({ queryKey: ['project', projectId] })
    },
  })
}

export function useToggleAutoDeploy(projectId: string, enable: boolean) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api[enable ? 'post' : 'delete']<void>(`/projects/${projectId}/webhook`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })
}

// Servers
export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: () => api.get<Server[]>('/servers'),
  })
}

export function useTestServer(serverId: string) {
  return useMutation({
    mutationFn: () => api.post<{ success: boolean }>(`/servers/${serverId}/test`),
  })
}

export function useConnectServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ConnectServerForm) => api.post<Server>('/servers/connect', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  })
}

export function useProvisionServer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProvisionServerForm) => api.post<{ server: Server }>('/servers/provision', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  })
}

export function useDeleteServer(serverId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<void>(`/servers/${serverId}`, { confirm: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  })
}

// Settings
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{
      github: { connected: boolean; login: string | null }
      aws: { usingInstanceProfile: boolean; configured: boolean; region: string }
    }>('/settings'),
  })
}

export function useConnectGitHub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => api.post<void>('/settings/github', { token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

export function useDisconnectGitHub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<void>('/settings/github'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

export function useSaveAWS() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { accessKeyId: string; secretAccessKey: string; region: string }) =>
      api.post<void>('/settings/aws', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

// GitHub - React hooks
export function useGitHubRepos() {
  return useQuery({
    queryKey: ['github', 'repos'],
    queryFn: () => api.get<{ repos: GitHubRepo[] }>('/github/repos'),
  })
}

export function useGitHubBranches(owner: string, repo: string) {
  return useQuery({
    queryKey: ['github', 'branches', owner, repo],
    queryFn: () => api.get<{ branches: string[] }>(`/github/repos/${owner}/${repo}/branches`),
    enabled: !!owner && !!repo,
  })
}

export function useGitHubDetect(owner: string, repo: string, branch: string) {
  return useQuery({
    queryKey: ['github', 'detect', owner, repo, branch],
    queryFn: () => api.get<GitHubDetect>(`/github/repos/${owner}/${repo}/detect?branch=${encodeURIComponent(branch)}`),
    enabled: !!owner && !!repo && !!branch,
  })
}

// GitHub - Async helpers for one-off fetches (for modals)
export async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  const { repos } = await api.get<{ repos: GitHubRepo[] }>('/github/repos')
  return repos
}

export async function fetchGitHubBranches(owner: string, repo: string): Promise<string[]> {
  const { branches } = await api.get<{ branches: string[] }>(`/github/repos/${owner}/${repo}/branches`)
  return branches
}

export async function fetchGitHubDetect(owner: string, repo: string, branch: string): Promise<GitHubDetect> {
  return api.get<GitHubDetect>(`/github/repos/${owner}/${repo}/detect?branch=${encodeURIComponent(branch)}`)
}

// Audit
export function useAudit() {
  return useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<AuditEvent[]>('/audit'),
    staleTime: 120_000,
  })
}