# Project Detail (React + TypeScript)

## Purpose (Updated)

The Project Detail page is the central hub for managing a specific deployed project. It shows project configuration, deployment history, and provides actions to deploy, rollback, restart, and manage settings. Users spend significant time on this page monitoring deployment progress and managing their project's configuration.

It follows a **"state over statistics"** approach (per the PRD §10), prioritizing the current health and status over overwhelming users with metrics. The page is tabbed into: Releases (deployments), Logs, Secrets, and Settings.

Built with **React + TypeScript + React Query**, replacing the vanilla JS `app.js` `renderProjectDetail()` function and associated tab/deployment functions.

## User Goal

- View the current deployment status and health of the project
- Monitor the latest deployment (building → success/failure progress)
- Trigger a new deployment when needed
- Roll back to a previous release if the current one fails
- View application logs for debugging
- Manage environment variables (secrets)
- Edit project settings (branch, server, ports, auto-deploy)
- Quickly understand if the project is healthy or needs attention
- Navigate back to the projects list

## Layout (React Components)

### Top Section: Project Header

- **Component**: `<ProjectHeader project={projectData} />`
- **Structure**:
  - `<ProjectHeader>` renders a `.panel` with structured content
  - **Project name and details** (left side):
    - `<h2>` with project name (18-20px, font-weight 600)
    - Repository info: `repoFullName @ branch → host:hostPort` (10-12px, monospaced, color var(--text-secondary))
    - Current health pill (`.Pill` component showing healthy/unhealthy state)
    - "Deploy" primary button (`.btn btn-primary`) - triggers new deployment
  - **Right side actions** (inline row):
    - Health pill (project-level status)
    - "Deploy" button

### Tab Bar

- **Component**: `<Tabs>` component (React Tab View or simple state management)
- **Tabs** (4 tabs, current state indicated via state):
  1. **Releases** (active by default) - deployment history
  2. **Logs** - application logs
  3. **Secrets** - environment variables
  4. **Settings** - project configuration
- **Styling**: 
  - Each tab: `<Tab>` component with border-bottom styling
  - Active tab: color var(--text), border-bottom var(--accent), font-weight 600
  - Inactive tab: color var(--text-secondary), border-bottom transparent
- **Behavior**: Clicking a tab shows that content, hides others (tab-panel active/inactive)

### Tab Panels (4 panels, only one visible at a time)

#### Tab 1: Releases

- **Component**: `<ReleasesTab projectId={projectId} />`
- **Content**: Deployment table/list
- **State**:
  - If no deployments: `<EmptyState title="No deployments yet" description="Click Deploy to ship the current branch." />`
  - If deployments exist: `<DeploymentTable deployments={deployments} />`
- **Details**:
  - Table with columns: #, Commit, Status, Trigger, When, Action
  - Each row shows deployment number, commit SHA, status pill, trigger method, time ago, and "Rollback here" button for non-current deployments
  - Current deployment indicator: Row showing "current" status for the active deployment
  - **Polling**: If latest deployment is "building", auto-polling updates status every 1.8s (via React Query `refetchInterval`)
  - **Rollback action**: "Rollback here" button on older completed deployments shows confirm modal, then calls rollback API

#### Tab 2: Logs

- **Component**: `<LogsPane projectId={projectId} />`
- **Content**: 
  - `<LogPane>` component showing `<pre>` text (initially "Loading…" or skeleton)
  - Auto-refresh mechanism (React Query `refetchInterval` or manual "Refresh" button)
  - "Refresh" button to manually refresh logs
  - "Restart container" button
- **Log content**: Text output from the server, last 300 lines
- **Auto-scroll**: Pane scrolls to bottom on each refresh
- **Refresh logic**: Fetches `/api/projects/{id}/logs?lines=300`, updates text content, scrolls to bottom

#### Tab 3: Secrets

- **Component**: `<SecretsPane projectId={projectId} />`
- **Content**:
  - List of environment variable keys, each showing "KEY = ••••••••" (monospaced, masked)
  - "Remove" button per key to delete the variable
  - Add new variable form: input key + input value + "Save" button
  - Note: "Values are encrypted at rest and never shown again after saving. Redeploy to pick up changes."
- **Actions**:
  - Remove individual variable (DELETE API call + re-fetch)
  - Add new variable (form submit via PUT API to `/api/projects/{id}/secrets`)
  - Toast feedback: "Removed. Redeploy to apply." or "Saved. Redeploy to apply."

#### Tab 4: Settings

- **Component**: `<ProjectSettingsPane project={project} />`
- **Content**: Project configuration form
- **Fields**:
  - Branch input (text input showing current branch)
  - Server select (dropdown of available servers)
  - Container port input (number input)
  - Host port input (number input)
  - Health check path input (text input)
  - Auto-restart switch (checkbox with track/thump)
- **Sections**:
  - "Save settings" primary button (form submit)
  - "Auto-deploy" toggle row (on/off with enable/disable CTA)
  - "Danger zone" - "Delete project" dangerous button
- **Behavior**:
  - Form saves project config via PATCH API
  - Auto-deploy toggle enables/disables webhook (POST/DELETE to `/api/projects/{id}/webhook`)
  - Delete project shows confirmation dialog
  - On delete: removes project from Forge, keeps running container on server (as per PRD)

### Breadcrumbs

- **Location**: Topbar component, below sidebar indicator
- **Content**: "Projects / {project name}"
- **Purpose**: Shows navigation context, clicking "Projects" returns to projects list

## Data Fetching (React Query)

### API Calls

```typescript
// Get project detail
const { data: projectData } = useQuery({
  queryKey: ['project', projectId],
  queryFn: async () => {
    const res = await fetch(`/api/projects/${projectId}`, {
      credentials: 'same-origin',
      headers: { 'X-Forge-Client': '1' },
    });
    if (!res.ok) throw new Error('Failed to load project');
    return res.json(); // { project, deployments, secrets }
  },
  staleTime: 30000,
});

// Poll for deployment building status
const { data: latestDeployment, refetch } = useQuery({
  queryKey: ['deployment', projectId, 'latest'],
  queryFn: async () => {
    const res = await fetch(`/api/projects/${projectId}/deployments/1`, // latest deployment
      { credentials: 'same-origin' });
    return res.json();
  },
  enabled: !!projectId,
  refetchInterval: latestDeployment?.status === 'building' ? 1800 : false, // 1.8s while building
  refetchIntervalInBackground: true,
});
```

### Type Definitions

```typescript
interface ProjectDetailData {
  project: {
    id: string;
    name: string;
    repoFullName: string;
    branch: string;
    hostPort: number;
    serverId: string | null;
    autoDeploy: boolean;
    health: 'healthy' | 'attention' | 'critical';
    currentDeployment: Deployment | null;
    deployments: Deployment[];
    secrets: { keys: string[] };
  };
}

interface Deployment {
  id: string;
  number: number;
  status: 'building' | 'success' | 'failed' | 'blocked';
  commitSha: string;
  trigger: 'github' | 'manual';
  startedAt: string;
  error?: string;
}
```

## Components

### ProjectHeader

```typescript
interface ProjectHeaderProps {
  project: {
    name: string;
    repoFullName: string;
    branch: string;
    health: 'healthy' | 'attention' | 'critical';
  };
  onDeployClick: () => void;
}

function ProjectHeader({ project, onDeployClick }: ProjectHeaderProps) => {
  const healthClass = `pill pill-${project.health}`; // pill-success / pill-danger
  
  return (
    <Panel>
      <PanelHeader>
        <div>
          <h2 className="text-2xl font-bold">{project.name}</h2>
          <p className="text-sm text-text-secondary font-mono">
            {project.repoFullName} @ {project.branch} → Server:{project.hostPort || '—'}
          </p>
        </div>
        <div className="inline-row items-center gap-4">
          <span className={healthClass} />
          <Button variant="primary" onClick={onDeployClick}>Deploy</Button>
        </div>
      </PanelHeader>
    </Panel>
  );
};
```

### Tabs (React Tab View simplified)

```typescript
interface TabProps {
  defaultValue: 'releases' | 'logs' | 'secrets' | 'settings';
  values: ('releases' | 'logs' | 'secrets' | 'settings')[];
}

function Tabs({ defaultValue, values }: TabProps) {
  const [value, setValue] = useState(defaultValue);
  
  return (
    <div className="tab-bar border-b border-border mb-4">
      {values.map(val => (
        <Tab
          key={val}
          value={val}
          onValueChange={setValue}
          active={value === val}
        >
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tab>
      ))}
    </div>
  );
}

function Tab({ value, onValueChange, active, children }: TabProps) {
  return (
    <button
      className={clsx(
        'tab-btn rounded-none border-b-2 border-transparent px-4 py-2 text-sm font-medium',
        active && 'text-text border-b-primary',
        !active && 'text-text-secondary hover:text-text'
      )}
      onClick={() => onValueChange(value)}
    >
      {children}
    </button>
  );
}

function TabPanel({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <div 
      className={`tab-panel ${value === 'releases' ? 'active' : ''}`} 
      style={{ display: 'none' }}
    >
      {children}
    </div>
  );
}
```

### DeploymentTable

```typescript
interface DeploymentRowProps {
  deployment: Deployment;
  onRollbackClick: (deploymentId: string) => void;
}

function DeploymentRow({ deployment, onRollbackClick }: DeploymentRowProps) => {
  const statusClass = `pill pill-${deployment.status}`; // pill-success / pill-warning / pill-danger
  const isCurrent = deployment.id === /* current deployment id */;
  
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-raised cursor-pointer">
      <td className="font-medium">#{deployment.number}</td>
      <td className="text-sm font-mono">{{ deployment.commitSha || '—' }}</td>
      <td><span className={statusClass} /></td>
      <td className="text-sm">{{ deployment.trigger }}</td>
      <td className="text-sm text-text-muted">{{ timeAgo(deployment.startedAt) }}</td>
      <td>
        {isCurrent ? (
          <span className="text-text-muted font-small">current</span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => onRollbackClick(deployment.id)}>
            Rollback here
          </Button>
        )}
      </td>
    </tr>
  );
};
```

### LogPane

```typescript
function LogPane({ projectId }: { projectId: string }) {
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['logs', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/logs?lines=300`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed to fetch logs');
      return res.json(); // { logs: string }
    },
    refetchInterval: false, // manual refresh only, or set interval for auto
  });

  return (
    <div>
      {isLoading ? (
        <SkeletonLine height={12} width="100%" />
      ) : (
        <pre className="log-pane text-text mono text-sm line-height-relaxed">
          {logs || '(empty)'}
        </pre>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={refetch}>Refresh</Button>
        <Button size="sm" onClick={restartContainer}>Restart container</Button>
      </div>
    </div>
  );
}
```

### SecretsPane

```typescript
function SecretsPane({ projectId }: { projectId: string }) {
  const { data: { keys = [] }, refetch } = useQuery({
    queryKey: ['secrets', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/secrets`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed to fetch secrets');
      return res.json(); // { keys: string[] }
    },
  });

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAdd = async () => {
    const res = await fetch(`/api/projects/${projectId}/secrets`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey, value: newValue }),
    });
    if (!res.ok) throw new Error('Failed to save secret');
    setNewKey('');
    setNewValue('');
    refetch(); // re-fetch secrets list
    toast('Saved. Redeploy to apply.', 'success');
  };

  return (
    <div>
      <p className="text-text-muted text-xs mb-4">
        Values are encrypted at rest and never shown again after saving. Redeploy to pick up changes.
      </p>
      {keys.length ? (
        <ul className="space-y-2">
          {keys.map(key => (
            <li key={key} className="inline-flex items-center gap-2">
              <span className="font-mono text-sm text-text-secondary">
                {key} = {'••••••••'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => handleRemove(key)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted text-sm">No environment variables set.</p>
      )}
      
      <form onSubmit={handleAdd} className="mt-4">
        <div className="grid grid-cols-2 gap-4">
          <input 
            value={newKey} 
            onChange={e => setNewKey(e.target.value)} 
            placeholder="DATABASE_URL" 
            className="rounded border border-border bg-surface text-text px-2 py-1 w-full"
            required
          />
          <input 
            value={newValue} 
            onChange={e => setNewValue(e.target.value)} 
            type="password" 
            placeholder="••••••••" 
            className="rounded border border-border bg-surface text-text px-2 py-1 w-full"
            required
          />
        </div>
        <Button type="submit" className="mt-4 w-full">
          Save
        </Button>
      </form>
    </div>
  );
}
```

### ProjectSettingsPane

```typescript
function ProjectSettingsPane({ project }: { project: ProjectDetailData['project'] }) {
  const [branch, setBranch] = useState(project.branch);
  const [port, setPort] = useState(project.hostPort); // or project.port
  const [hostPort, setHostPort] = useState(project.hostPort);
  const [healthPath, setHealthPath] = useState(project.healthPath || '/health');
  const [serverId, setServerId] = useState(project.serverId);
  const [autoDeploy, setAutoDeploy] = useState(project.autoDeploy);

  const handleSave = async () => {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        branch, port: Number(port), hostPort: Number(hostPort), healthPath, serverId, autoDeploy 
      }),
    });
    if (!res.ok) throw new Error('Failed to save settings');
    toast('Saved.', 'success');
    // re-fetch project detail
    queryClient.invalidateQueries(['project', project.id]);
  };

  const autoDeployText = autoDeploy ? (
    <span>Auto-deploy is on. Pushes to "{branch}" trigger a deploy automatically.</span>
  ) : (
    <span>Auto-deploy is off. Pushes to "{branch}" require a manual Deploy click.</span>
  );

  const autoDeployButton = autoDeploy ? (
    <Button size="sm" onClick={async () => {
      await queryClient.refetchQueries(['project', project.id]);
      await fetch(`/api/projects/${project.id}/webhook`, { method: 'DELETE' });
      toast('Auto-disabled.', 'success');
      setAutoDeploy(false);
    }}>Disable
  ) : (
    <Button size="sm" onClick={async () => {
      await fetch(`/api/projects/${project.id}/webhook`, { method: 'POST' });
      toast('Auto-deploy enabled.', 'success');
      setAutoDeploy(true);
    }}>Enable
  );

  return (
    <Panel>
      <PanelHeader>
        <h3>Settings</h3>
      </PanelHeader>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <input 
            value={branch} 
            onChange={e => setBranch(e.target.value)} 
            placeholder="branch" 
            className="rounded border border-border bg-surface text-text px-2 py-1 w-full"
          />
          <select 
            value={serverId || ''} 
            onChange={e => setServerId(e.target.value)} 
            className="rounded border border-border bg-surface text-text px-2 py-1 w-full"
          >
            <option value="">—</option>
            {state.servers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({{ s.host }})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <input 
            value={port} 
            onChange={e => setPort(e.target.value)} 
            type="number" 
            placeholder="container port" 
            className="rounded border border-border bg-surface text-text px-2 py-1 w-full"
          />
          <input 
            value={hostPort} 
            onChange={e => setHostPort(e.target.value)} 
            type="number" 
            placeholder="host port" 
            className="rounded border border-border bg-surface text-text px-2 py-1 w-full"
          />
        </div>
        <input 
          value={healthPath} 
          onChange={e => setHealthPath(e.target.value)} 
          placeholder="/health" 
          className="rounded border border-border bg-surface text-text px-2 py-1 w-full"
        />
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={autoDeploy} 
            onChange={e => setAutoDeploy(e.target.checked)} 
            className="switch-checkbox"
          />
          <span>{autoDeploy ? 'Auto-restart' : 'Manual deploy'}</span>
        </div>
      </form>
      
      <hr style={{ borderColor: 'var(--border)', margin: '6px 0' }} />
      
      <div>
        {autoDeployText}
        {autoDeployButton}
      </div>
      
      <hr style={{ borderColor: 'var(--border)', margin: '6px 0' }} />
      
      <Button 
        className="text-danger" 
        onClick={() => confirmDelete(project.id)} 
      >
        Delete project
      </Button>
    </Panel>
  );
}
```

## Interactions

### Tab Navigation

- **Click tab button**: Shows corresponding panel, hides others
- **Keyboard**: Tab order follows visual pattern; Arrow keys could navigate but not essential
- **Active state**: Only one tab panel visible at a time (`.tab-panel.active` / `.tab-btn.active`)
- **Initial state**: "Releases" tab is active by default (state.currentTab = 'releases')

### Deploy Button

- **Click**: Triggers `triggerDeploy(projectId)`
- **Action**: POST to `/api/projects/{id}/deploy` API
- **Feedback**: 
  - Toast: "Deployment #${deployment.number} started."
  - Re-renders project detail (calls useQuery or refetch)
  - Starts polling for deployment status (React Query `refetchInterval`)
- **Visual**: Button may be disabled during API call, re-enables after

### Rollback

- ** "Rollback here" button** on older deployments:
  - Shows confirm modal: `title: "Roll back to release #${target.number}?"`, `body: "This redeploys commit ${target.commitSha} (image ${target.imageTag}) to production immediately."`
  - Confirm action: POST rollback API, toast success, re-render, start polling
  - Dangerous action: requires explicit confirmation

### Log Refresh

- **Manual "Refresh" button**: Calls `refetch()` on the useQuery hook, updates log text, scrolls to bottom
- **Auto-refresh**: On panel mount, starts refreshing every poll cycle (React Query `refetchInterval`)
- **Visual**: Log text updates, scroll position maintained at bottom

### Secret Management

- **Remove button** per secret:
  - DELETE API call to remove secret
  - Re-fetches secrets list
  - Toast: "Removed. Redeploy to apply."
- **Add new secret**:
  - Input key + input value fields
  - Form submit via PUT API to `/api/projects/{id}/secrets`
  - Toast: "Saved. Redeploy to apply."
  - Fields clear after save

### Auto-Deploy Toggle

- **Currently on**:
  - Shows: "Auto-deploy is on. Pushes to "branch" trigger a deploy automatically."
  - Button: "Disable"
  - On click: DELETE webhook API, toast "Auto-disabled.", re-render project detail
- **Currently off**:
  - Shows: "Auto-deploy is off. Pushes to "branch" require a manual Deploy click."
  - Button: "Enable"
  - On click: POST webhook API, toast "Auto-deploy enabled.", re-render project detail

### Settings Form Save

- **Submit**: PATCH to `/api/projects/{id}` API with updated config
- **Feedback**: 
  - Toast: "Saved."
  - Re-renders project detail (shows updated config)
- **Validation**: Client-side (form inputs), server-side validates

### Delete Project

- **Button** in danger zone:
  - Shows confirm modal with:
    - Title: `Delete "{project.name}"?`
    - Body: "This removes the project from Forge and its release history. The running container on the server is left as-is — stop it manually if needed."
    - Confirm label: "Delete project"
  - On confirm: DELETE `/api/projects/{id}` with `{ confirm: true }`
  - Toast: "Project deleted."
  - Navigation: `useNavigate('/projects')` (returns to projects list)

## Motion

### Tab Panel Transition

- **Instant content swap**: Tab panels use state management (value === 'releases' ? 'active' : '' → display none/block)
- **No animation** between tab content (simple class toggle)
- **Tab button hover**: Hover provides feedback (background var(--surface-raised))
- **Active class toggle**: `.tab-btn.active` / `.tab-panel.active` class addition/removal

### Deploy Action

- **Button state**: During API call, submit button `disabled = true` and text may show "Creating..."
- **Post-deploy**: Immediately re-renders project detail (calls useQuery with refetch)
- **Polling**: If deployment status is "building", starts polling every 1.8s via React Query
- **Status update**: Poller updates the status pill in the deployment table

### Modal Transitions

- **New project modal**: Use React Transition Group or Framer Motion fade-in
- **Confirm modals** (rollback, delete): Use React Modal or simple overlay with fade-in
- **On reduced motion**: fade duration set to 0.001ms per design system

### Log Refresh Animation

- **Text update**: Instant text replacement in `<pre>` element
- **Scroll to bottom**: `pre.scrollTop = pre.scrollHeight` - layout operation
- **No animation** on the log content itself - just text replacement

### Reduced Motion

- **Tab transitions**: Instant (no animation to respect)
- **Deploy/polling**: Status updates are instant, no spinners needed (or use simple CSS if desired)
- **Modals**: Fade-in should respect `prefers-reduced-motion` (0.001ms duration)
- **Log scroll**: `scrollTop = scrollHeight` can be conditional on reduced motion preference
- **No essential motion** that would degrade experience if removed

## Responsive Behavior

### Desktop (1440px+, 1280px+)

- Full project header with all details visible
- Tab bar with 4 tabs visible, reasonable width
- Deployment table: all 6 columns visible (#, Commit, Status, Trigger, When, Action)
- Log pane: max-height 420px, scrollbar present but not obtrusive
- Settings form: full width, all fields visible on one line or two-row layout
- Breadcrumbs: full "Projects / {project name}" visible

### Laptop (1024px+)

- Project header fits well
- Tab bar: 4 tabs may need slight shrinking but fit
- Deployment table: horizontal scroll available via `.table-wrap` if needed
- Log pane: 420px max-height is reasonable
- Settings: fields fit, may wrap to two rows naturally

### Tablet (768px+)

- Project header: may need to stack some elements (repo info below name)
- Tab bar: 4 tabs may be cramped; consider reducing to essential tabs
- Current implementation: all 4 tabs always visible, user can scroll/click
- Deployment table: columns may overflow; horizontal scroll via `.table-wrap`
- Log pane: may need reduced max-height (e.g., 300px) or scrolling
- Settings form: fields may wrap; mobile adaptation needed

### Mobile Small (430px+)

- Project header: stacks repo info below project name; health pill and deploy button may be on separate line
- Tab bar: tabs may be too narrow; consider reducing to 2 essential tabs (Releases + one other)
  - OR: tab bar uses full width, tabs shrink to fit
- Deployment table: horizontal scroll essential; columns become hard to read on narrow
  - Consider: on mobile, show simplified view or prioritize key columns
- Log pane: max-height may need reduction (200-250px); scrolling may take more screen space
- Settings form: fields stack vertically; one field per row; most mobile-friendly layout
- Breadcrumbs: may be truncated, but functional

### Mobile Smallest (375px-, 390px-)

- Project header: essential info only (name + health); deploy button may be full-width below
- Tab bar: highly likely to reduce tab count. Essential: Releases + one other (probably Logs or Settings)
  - Could implement: tab bar shows only 2 tabs, others accessible via "more" menu or swipe
- Deployment table: horizontal scroll possible but poor UX; consider:
  - Show only: Status + Action (Rollback) columns
  - Or: link to detail view differently on mobile
- Log pane: reduced height (150-200px); may need "view full logs" link
- Settings form: vertical stack, one field per row - most mobile-friendly layout
- Delete confirmation: full-screen modal or large centered modal on small viewport

### Tab Reduction Strategy (mobile)

Consider implementing a "more" dropdown or persistent bottom navigation for tabs on mobile:

**Option A**: Two-tab bar on mobile (Releases + Logs/Secrets/Settings as "More →")
- Tab bar shows 2 tabs only
- "More" icon/button reveals other tabs in a small dropdown or bottom sheet
- Most used tabs first

**Option B**: Persistent tab indicator
- Small dot/indicator shows "X more tabs available"
- User can swipe or click to view other tabs
- Less common in dashboards, but possible

**Option C**: Keep all tabs, horizontal scroll
- User scrolls left/right to see all 4 tabs
- Simplest to implement, worst UX on narrow screens
- Not recommended but possible

I'll recommend **Option A** (2 essential tabs + "More") for mobile, with all 4 tabs on desktop/laptop.

## Loading State

### Initial Page Load

- **Project header**: Shows skeleton loaders
  - Current in code: `<SkeletonLine />` for name line + repo info line
  - Two skeletons likely: one for h2 name, one for repo info paragraph
- **Tab panels**: Each tab panel shows skeleton loader(s)
  - Releases tab: `<SkeletonLine />` for table rows (maybe 2-3 rows)
  - Logs tab: "Loading…" text in log-pane, or `<SkeletonLine width="60%" />`
  - Secrets tab: maybe skeleton or "No secrets yet" state
  - Settings tab: form fields as skeletons or empty state
- **Deploy button**: Enabled (not disabled during initial load)
- **Breadcrumb**: "Projects / {project name}" shown once project data loads

### API Data Fetch (`/projects/{id}`)

- **GET /projects/{id}**: Fetches project detail data
- **While loading**: Skeletons shown, content hidden or replaced
- **On success**: All content replaces skeletons, poller starts if deployment building
- **On error**: Error message in header area, skeletons removed

### Polling State (deployment building)

- **If latest deployment is "building"**:
  - React Query `refetchInterval` set to 1800ms
  - Status pill updates in real-time
  - Status changes from "building" → "success"/"failed"
  - Toast on completion: "Deployment #X is live." or "Deployment #X X: error message"
- **Poller duration**: 1800ms between polls while building, stops when status changes
- **Initial poll delay**: 1200ms before first poll starts (via `refetchInterval` config)

### Error State

- **API failure** (`/projects/{id}`):
  - Shows error message: "Could not load project" + error message
  - May offer "Try again" or user navigates away/back
- **Deployment failure**:
  - Status pill turns red (`.pill pill-danger`)
  - Toast shows error: "Deployment #X X: {error}"
  - User can rollback or deploy again

### Skeleton Animation

- `.skeleton-line` shimmer: 1.4s ease infinite (CSS keyframes from original styles.css)
- In React: can use CSS animation class or Framer Motion
- May be less ideal for complex page with multiple sections
- Could use row-by-row skeleton animation, or just show skeletons until first data arrives, then reveal

## Empty State

### No Deployments Yet

- **Location**: Releases tab, when `!deployments.length`
- **Message**: "No deployments yet. Click Deploy to ship the current branch."
- **CTA**: Implicit - "Deploy" button in project header calls attention
- **Visual**: Centered message, uses empty-state styling or custom panel content
- **Tone**: Encouraging, clear CTA

### No Secrets

- **Location**: Secrets tab, when no environment variables set
- **Message**: "No environment variables set."
- **CTA**: Add form below or "Add variable" CTA (existing code has add form always visible, shows "No environment variables set." when empty)
- **Visual**: Same as other empty states, consistent

### Logs Empty (unlikely but possible)

- **Location**: Logs tab
- **Message**: Could show "No logs yet." or just show the loading state persist
- **Less critical** - logs are usually populated after first deployment

## Accessibility (React + ARIA)

### Keyboard Navigation

- **Tab key**: Moves through focusable elements:
  - Tab bar buttons (`.tab-btn`)
  - Form inputs (within each tab panel)
  - Buttons (deploy, refresh, restart, add secret, remove, delete)
  - "← All projects" breadcrumb link (in topbar)
- **Arrow keys**: Within tab bar, could navigate between tabs (not currently implemented, but could enhance)
- **Enter**: Activates focused button or tab
- **Escape**: Closes any open modals, returns focus to trigger element

### Focus States

- **`:focus-visible`**: 2px solid var(--accent-strong), outline-offset 2px (consistent with design system)
- **Tab bar buttons**: On focus, have visual distinction (border-bottom change + color change)
- **Form inputs**: On focus, border-color changes to var(--accent) (existing input CSS)
- **Table rows**: Could have `:focus` state if rows are focusable (tabindex=0), or rely on child elements

### Semantic HTML

- **`<h2>`** for project name (header section)
- **`<h3>`** or `<h2>` for section titles within tabs (e.g., "Releases", "Logs")
- **`<table>`** for deployment table (with `<thead>`/`<tbody>`)
- **`<tbody>`** rows for each deployment
- **`<td>`** / `<th>` for cells
- **`<button>`** elements for all actions (deploy, rollback, refresh, restart, add, remove, delete)
- **`<pre>`** for log pane (monospaced output)
- **`<form>`** for settings form, secret add form
- **`<div class="tab-bar">`** and **`.tab-btn`** for tab navigation
- **`.`**: Various div containers for layout
- **Breadcrumb**: `<div class="breadcrumb">` in topbar, with `<strong>` for current section

### Contrast

- Project name text against var(--surface) - WCAG AA
- Health pill colors against var(--surface-raised) - should meet contrast
- Tab active/inactive colors: var(--text) vs var(--text-secondary) against var(--surface) - should be distinguishable
- Button text contrast: .btn primary on var(--surface-raised) - existing code has #0d1216 text on accent background (good contrast)
- .btn-danger has var(--danger) on default background - good contrast
- Log pane background (#0d1013) against var(--text) (#e8e6e1) - good contrast for monospaced text
- Hover backgrounds and border colors all have sufficient contrast

### Screen-Reader Structure

- Project name announced as heading (h2)
- Tab bar: list of buttons, each with accessible name (tab text)
- Deployment table: headers (<th>) provide column context; row data announced sequentially
- "Rollback here" button has accessible name (button text)
- "current" span announced as "current" (supplementary status)
- Log pane: `<pre>` content announced line by line; may be lengthy but that's expected
- Secret keys: monospaced text announced; masked values shown as dots
- "Delete project" button has accessible name and triggers confirmation dialog
- "← All projects"breadcrumb link has accessible name

### Accessible Forms

- Settings form: labels associated with inputs (existing `h('label', {}, ...)` pattern adapted to React Hook Form)
- Required fields have `required` attribute
- Error messages displayed inline if validation fails
- Form submission has loading state on button
- Delete confirmation is a modal with proper role/aria

### Reduced Motion

- Tab transitions: instant (no animation)
- Deploy/polling: status updates are instant, no spinners required (or use very subtle ones)
- Modals: fade-in should respect `prefers-reduced-motion` (0.001ms duration)
- Log scroll: `scrollTop = scrollHeight` can be skipped if reduced motion preferred
- No essential motion removed - alternatives provided

### Live Region (Enhancement)

- Consider adding `aria-live="polite"` to status update areas so screen readers announce status changes
- Could add to deployment status pill or toast container
- Not currently implemented but would improve accessibility

## Performance (React + React Query)

### API Endpoints

- **GET /projects/{id}** - Returns project detail (deployment data, config, etc.)
- **GET /projects/{id}/logs?lines=300** - Returns application logs (last 300 lines)
- **POST /api/projects/{id}/deploy** - Triggers deployment
- **POST/DELETE /api/projects/{id}/webhook** - Auto-deploy toggle
- **GET /api/projects/{id}/secrets** - Fetches secrets
- **Response time**: Should be fast (< 500ms) since it reads from JSON file store
- **Polling**: 1.8s intervals while deployment building; 1200ms initial delay

### Table Rendering

- One `<tr>` per deployment, 6 `<td>` per row
- Typical project has 5-20 deployments; performance is fine
- No virtual DOM - direct DOM manipulation via React
- Horizontal scroll wrapper `.table-wrap` adds no measurables impact

### Polling Impact

- **One poller per active deployment** (via React Query `refetchInterval`)
- **1.8s interval** while deployment is building
- **Stops** when deployment completes (success/failed)
- **Memory**: `state.pollers[deploymentId]` equivalent in React Query; cleaned up on deployment completion
- **Re-renders**: Each poll may re-render project detail (useQuery refetch)
- **Optimization**: Could throttle re-renders, but current implementation re-renders on each poll (acceptable for typical use)

### Bundle Impact

- React 18 + React DOM: ~100KB gzipped
- @tanstack/react-query: ~5KB gzipped
- Framer Motion (if used): ~25KB gzipped
- Custom components: minimal
- Total: ~130-150KB gzipped (reasonable increase over vanilla JS)

### Rendering Performance

- DOM updates are targeted (replacing specific elements, not full page)
- Skeleton elements are simple divs - cheap to remove/replace
- Table reflow on resize is handled by CSS grid/flex properties
- Tab content swap is class toggle (display none/block) - very cheap

### Memory

- Project data stored in `useQuery` cache + `state.currentProjectId`
- Pollers stored in React Query `refetchInterval` objects - cleaned up on deployment completion
- No leaked timers or event listeners
- Tab panels swap content; old content is removed from DOM

## Implementation Notes

### Existing Code Port

The project detail page is extensively ported from `app.js` (`renderProjectDetail()` function, lines 551-595, plus associated tab and deployment functions). Key mappings:

**Already mapped:**
- Project data fetch (`/api/projects/${id}`) ✅
- Rendering project header with name, repo, health pill, deploy button ✅
- 4-tab bar (releases, logs, secrets, settings) ✅
- Releases tab with deployment table ✅
- Logs tab with log-pane and refresh ✅
- Secrets tab with key list and add form ✅
- Settings tab with config form ✅
- Tab switching functionality ✅
- Deploy button and polling ✅
- Rollback confirm modal ✅
- Time-ago formatting ✅
- Skeleton loading states ✅

**New (React + TS + React Query):**
- `useQuery` + `useMutation` hooks for all API calls
- React Query for polling (replaces manual setTimeout)
- TypeScript types for all data shapes
- React component structure (JSX vs innerHTML)
- Component-based architecture (ProjectHeader, Tabs, DeploymentTable, etc. vs one big function)
- React Hook Form for settings form (optional, vs ad-hoc in app.js)
- React Query for data caching and refetching

**Enhancements from React version:**
- Automatic polling via React Query (no manual setTimeout)
- Built-in error states and retry logic
- Loading skeletons managed by React Query
- Type safety across the component
- Easy cache invalidation and refetching (queryClient.invalidateQueries)
- Better testability with @testing-library/react
- Form state management with React Hook Form

**Still needing port:**
- Inline style removal: `style="font-size:18px"`, `style="height:18px"` etc. → CSS classes
- Tab active state: should use `.tab-btn.active` class styles
- Health pill consistency: should use same `.pill pill-${state}` pattern
- Log pane background: should use design system colors
- Deployment table striping: `tr:nth-child(even)` for readability
- Header typography hierarchy: h2 for project name, smaller text for repo info
- Border radius: ensure all panels/inputs use var(--radius) consistently
- Auto-deploy text: systematize the on/off text generation
- Danger zone: delete button should be .btn .btn-sm .btn-danger pattern
- Breadcrumb: should always show "Projects / {name}" when on project detail page

### API Contract

The `/projects/{id}` API endpoint should return JSON with this shape:

```json
{
  "project": {
    "id": "project-uuid",
    "name": "expense-api",
    "repoFullName": "github.com/username/expense-api",
    "branch": "main",
    "hostPort": 8080,
    "serverId": "server-uuid",
    "autoDeploy": true/false,
    "health": {
      "state": "healthy" | "attention" | "critical"
    },
    "currentDeployment": {
      "id": "deployment-uuid",
      "number": 1,
      "status": "building" | "success" | "failed" | "blocked",
      "commitSha": "abc123...",
      "trigger": "github",
      "startedAt": "2026-09-20T14:30:00Z",
      "error": "optional error message"
    },
    "deployments": [ /* array of deployment objects */ ],
    "secrets": {
      "keys": ["DATABASE_URL", "JWT_SECRET"]
    }
  }
}
```

Or the format that the existing code expects. Key fields: `project.name`, `project.repoFullName`, `project.branch`, `project.health.state`, `project.currentDeployment`, `project.deployments`, `project.secrets.keys`.

### Component Integration

- **Project header**: Should use `.Panel` component with structured header layout
- **Tab bar**: Should use `.tab-bar` / `.tab-btn` classes from design system
- **Deployment table**: Should use `.table` / `.table-wrap` with React rows
- **Health pills**: Should reference CSS variables var(--success)/var(--warning)/var(--danger)
- **Log pane**: Should use design system background colors
- **Skeletons**: Should follow systematic count and sizing from design system

### Visual Refinements to Apply

1. **Remove inline styles**: Move `style="font-size:18px"`, `style="height:18px"`, etc. to CSS classes in styles.css (or JSS/tailwind)
2. **Tab bar active state**: Ensure `.tab-btn.active` uses `.active` class styles (color var(--text), border-bottom var(--accent))
3. **Health pill consistency**: Project health pill should use same `.pill pill-${state}` pattern as other pages
4. **Log pane background**: Use design system colors, not hardcoded `#0d1013`
5. **Deployment table striping**: Consider `tr:nth-child(even) { background: var(--surface-raised); }` for readability
6. **Header typography hierarchy**: h2 for project name, smaller text for repo info - establish clear visual hierarchy
7. **Border radius**: Ensure all panels/inputs use var(--radius) (10px) consistently
8. **Auto-deploy text**: Systematize the on/off text generation
9. **Danger zone**: Delete button should be .btn .btn-sm .btn-danger pattern
10. **Breadcrumb**: Should always show "Projects / {name}" when on project detail page

### Testing Checklist (React + TS + React Query)

- [ ] Project detail loads with project data
- [ ] Tabs switch correctly (Releases → Logs → Secrets → Settings)
- [ ] Active tab has visual distinction (color + border-bottom)
- [ ] Deploy button triggers deployment and shows toast
- [ ] "Rollback here" button shows confirm modal and rollbacks on confirm
- [ ] Log refresh fetches and displays logs
- [ ] "Restart container" button works
- [ ] Secret add/remove works with toast feedback
- [ ] Settings form saves and re-renders project detail
- [ ] Delete project confirms, deletes, and returns to projects list
- [ ] Health pill color-codes correctly (healthy/green, attention/amber, critical/red)
- [ ] Skeleton loading shown before API data resolves
- [ ] Error message shown when API fails
- [ ] Focus-visible outlines on tab buttons, form inputs, buttons
- [ ] Tab order is logical: header → tab bar → panel content → footer actions
- [ ] Reduced motion preference respected (skeletons instant, modal fades instant)
- [ ] Deployment polling updates status in real-time
- [ ] "Current" deployment indicator shows correctly
- [ ] Breadcrumbs show "Projects / {project name}"
- [ ] Auto-deploy toggle enables/disables correctly
- [ ] Deployment table has consistent column widths
- [ ] Repository info text is readable but secondary
- [ ] Log pane has adequate height and scrollbar
- [ ] Modal confirmations (rollback, delete) work properly
- [ ] Horizontal scroll on deployment table if needed at narrow widths
- [ ] All color values are CSS variables from design system
- [ ] TypeScript types compile without errors
- [ ] React Query refetch/invalidate works correctly

## Visual References

- Original implementation in `app.js` `renderProjectDetail()` function (lines 551-595) and associated tab/deployment functions
- Design tokens in `public/styles.css` `:root` variables
- IBM Plex Sans / IBM Plex Mono font stack
- Color palette from existing styles.css (dark theme default)
- GitHub repository detail page inspiration - project monitoring dashboard
- Vercel/Netlify deploy dashboard style for deployment history
- Admin panel tabbed interface patterns
- Table row hover and alternating row patterns
- Form design patterns from existing Forge UI
- Modal confirmation dialog patterns (rollback, delete)
- Log output display patterns (monospaced, scrollable)
- React Tab View / simple tab state management patterns