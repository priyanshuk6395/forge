# Servers (React + TypeScript)

## Purpose (Updated)

The Servers page lists all servers connected to Forge, showing their status, provider, and actions available. It serves as the central registry for infrastructure management, where users can view existing servers, connect new ones via SSH, or provision new servers on AWS. This page is critical for infrastructure management - it's where users go to understand their server fleet and perform administration actions.

Built with **React + TypeScript + React Query**, replacing the vanilla JS `app.js` `loadServers()` function and the always-available modals.

## User Goal

- Browse all connected/provisioned servers at a glance
- Quickly assess the health/status of each server
- Connect a new server via existing SSH credentials
- Provision a new server on AWS EC2
- Test SSH connectivity to a server
- Remove a server that's no longer needed
- Understand which projects are deployed to which server

## Layout (React Components)

### Header Section

- **Component**: `<Panel><h2>Servers</h2></Panel>`
- **Purpose**: Section title
- **Content**: `<h2>Servers</h2>` - section title (18px, font-weight 600)

### Server List Area

Two states, similar to original but as React components:

#### State A: Servers Exist (table view)

- **Component**: `<ServerTable servers={servers} />`
- **Content**: HTML table with columns per server:
  - **Name** (server name, bold)
  - **Host** (IP address or hostname, monospaced hint)
  - **Provider** (AWS EC2 / Existing)
  - **Status** (status pill: ready/connecting/provisioning/bootstrap_failed)
  - **Actions** (button menu per server with test, download key, delete)
- **Row styling**:
  - Hover: background var(--surface-raised)
  - Cursor: pointer
  - Status pill color-coded: ready→green, connecting→warning, provisioning→warning, bootstrap_failed→danger

#### State B: No Servers (empty state)

- **Component**: `<EmptyState title="No servers yet" description="Connect any Linux box over SSH, or have Forge provision one on AWS." cta={<>{[{ label: "Connect existing", onClick: openConnectModal }, { label: "Provision on AWS", onClick: openProvisionModal }]}</> />`
- **Purpose**: Onboard user, explain server options, provide path to add first server

### Always-Available Action Modals (React Components)

These modals are always rendered in the UI (not conditionally), adapted from the original index.html persistent modals.

#### 1. Connect Existing Server Modal (`<ConnectServerModal />`)

- **Always visible** in the UI, typically in a fixed position or accessible via "Connect" CTA
- **Fields**:
  - Name (required input)
  - Host/IP (required input)
  - SSH user (default: "ubuntu", optional input or select)
  - Private key (TEA textarea, required)
- **Submit**: `api('/servers/connect', { method: 'POST', body: { name, host, sshUser, sshPort, privateKey } })`
- **Success toast**: "Server connected and prepared." + `queryClient.invalidateQueries(['servers])`
- **Error toast**: err.message
- **Cancel**: closes modal
- **Visual**: Same modal structure as original (`div.modal-overlay`, `div.modal`, form elements)

#### 2. Provision on AWS Modal (`<ProvisionServerModal />`)

- **Always visible** in the UI, typically alongside the connect modal
- **Fields**:
  - Name (required input)
  - Instance type (select: t3.micro, t3.small, t3.medium, t3.large)
  - SSH CIDR allow (input, default: 0.0.0.0/0, with helper text: "Use your own IP/32 to lock this down; 0.0.0.0/0 allows SSH from anywhere.")
- **Submit**: `api('/servers/provision', { method: 'POST', body: { name, instanceType, sshCidr } })`
- **Success toast**: "Server provisioned and ready." (or status message from API)
- **Error toast**: err.message
- **Cancel**: closes modal

## Data Fetching (React Query)

```typescript
function useServers() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await fetch('/api/servers', {
        credentials: 'same-origin',
        headers: { 'X-Forge-Client': '1' },
      });
      if (!res.ok) throw new Error('Failed to fetch servers');
      return res.json(); // array of server objects
    },
    staleTime: 30000,
  });

  const { mutate: testMutation } = useMutation({
    mutationFn: async (serverId: string) => {
      const res = await fetch(`/api/servers/${serverId}/test`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Forge-Client': '1' },
      });
      if (!res.ok) throw new Error('SSH test failed');
      const data = await res.json();
      toast(data.success ? 'SSH OK.' : data.error, data.success ? 'success' : 'error');
      return data;
    },
  });

  const { mutate: deleteMutation } = useMutation({
    mutationFn: async (serverId: string, confirm: boolean) => {
      if (!confirm) throw new Error('User cancelled');
      const res = await fetch(`/api/servers/${serverId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-Forge-Client': '1' },
        body: JSON.stringify({ confirm }),
      });
      if (!res.ok) throw new Error('Failed to delete server');
      toast('Server deleted.', 'success');
      queryClient.invalidateQueries(['servers']);
      return res.json();
    },
  });

  const { mutate: connectMutation } = useMutation({
    mutationFn: async (serverData: {
      name: string;
      host: string;
      sshUser: string;
      sshPort: number;
      privateKey: string;
    }) => {
      const res = await fetch('/api/servers/connect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Forge-Client': '1' },
        body: JSON.stringify(serverData),
      });
      if (!res.ok) throw new Error('Failed to connect server');
      toast('Server connected and prepared.', 'success');
      queryClient.invalidateQueries(['servers']);
      return res.json();
    },
  });

  const { mutate: provisionMutation } = useMutation({
    mutationFn: async (serverData: {
      name: string;
      instanceType: string;
      sshCidr: string;
    }) => {
      const res = await fetch('/api/servers/provision', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Forge-Client': '1' },
        body: JSON.stringify(serverData),
      });
      if (!res.ok) throw new Error('Failed to provision server');
      toast('Server provisioned and ready.', 'success');
      queryClient.invalidateQueries(['servers']);
      return res.json();
    },
  });

  return {
    servers: data,
    isLoading,
    isError,
    testMutation,
    deleteMutation,
    connectMutation,
    provisionMutation,
  };
}
```

## Type Definitions

```typescript
interface Server {
  id: string;
  name: string;
  host: string;
  provider: 'ec2' | 'existing';
  status: 'ready' | 'connecting' | 'provisioning' | 'bootstrap_failed';
  hasKey: boolean;
}

interface ServerTableProps {
  servers: Server[];
  onViewDetail?: (serverId: string) => void;
}
```

## Components

### ServerTable

```typescript
interface ServerRowProps {
  server: Server;
  onTestClick: (serverId: string) => void;
  onDeleteClick: (serverId: string) => void;
  onDownloadKeyClick?: (serverId: string) => void;
}

function ServerRow({ server, onTestClick, onDeleteClick, onDownloadKeyClick }: ServerRowProps) => {
  const statusClass = `pill pill-${server.status}`; // pill-success / pill-warning / pill-danger
  
  return (
    <tr className="hover:bg-surface-raised cursor-pointer transition-colors">
      <td className="font-medium">{{ server.name }}</td>
      <td className="text-sm text-text-muted font-mono">{{ server.host }}</td>
      <td>
        <span className={statusClass} />
      </td>
      <td className="text-sm">
        {server.provider === 'ec2' ? 'AWS EC2' : 'Existing'}
      </td>
      <td className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => onTestClick(server.id)}>
          Test
        </Button>
        {server.hasKey && (
          <a 
            href={`/api/servers/${server.id}/key`}
            target="_blank" 
            className="btn btn-ghost btn-sm"
          >
            Download key
          </a>
        )}
        <Button variant="danger" size="sm" onClick={() => onDeleteClick(server.id)}>
          Delete
        </Button>
      </td>
    </tr>
  );
};
```

### EmptyState (React version, with action CTAs)

```typescript
interface EmptyStateWithCTAProps {
  title: string;
  description: string;
  cta: React.ReactNode; // allows custom CTA elements, e.g. two buttons side-by-side
}

function EmptyStateWithCTA({ title, description, cta }: EmptyStateWithCTAProps) => {
  return (
    <div className="text-center py-12 text-text-secondary">
      <h3 className="text-text mb-3">{title}</h3>
      <p>{description}</p>
      <div className="mt-6">{cta}</div>
    </div>
  );
};
```

### Connect Server Modal

```typescript
function ConnectServerModal({ open }: { open: () => void; close: () => void }) => {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [user, setUser] = useState('ubuntu');
  const [key, setKey] = useState< string>('');

  const handleConnect = async () => {
    const res = await fetch('/api/servers/connect', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, host, sshUser: user, sshPort: 22, privateKey: key }),
    });
    if (!res.ok) throw new Error('Failed to connect');
    toast('Server connected and prepared.', 'success');
    close();
    queryClient.invalidateQueries(['servers']);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Connect an existing server</h3>
          <button onClick={close}>&times;</button>
        </div>
        <div className="modal-body">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="server-name"
            required
            className="w-full rounded border border-border bg-surface text-text px-3 py-2 mb-3"
          />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="3.110.221.4"
              required
              className="col-span-1 rounded border border-border bg-surface text-text px-3 py-2"
            />
            <select
              value={user}
              onChange={e => setUser(e.target.value)}
              className="col-span-2 rounded border border-border bg-surface text-text px-3 py-2"
            >
              <option value="ubuntu">ubuntu</option>
              <option value="root">root</option>
              {/* Add other common SSH users */}
            </select>
          </div>
          <textarea
            value={key}
            onChange={e => setKey(e.target.value)}
            rows={6}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            required
            className="w-full rounded border border-border bg-surface text-text px-3 py-2 mb-3"
          ></textarea>
        </div>
        <div className="modal-actions">
          <button onClick={close} className="btn mr-2">Cancel</button>
          <button onClick={handleConnect} className="btn btn-primary">Connect</button>
        </div>
      </div>
    </div>
  );
};
```

### Provision Server Modal

```typescript
function ProvisionServerModal({ open }: { open: () => void; close: () => void }) => {
  const [name, setName] = useState('');
  const [instanceType, setInstanceType] = useState<'t3.micro' | 't3.small' | 't3.medium' | 't3.large'>('t3.micro');
  const [sshCidr, setSshCidr] = useState('0.0.0.0/0');

  const handleProvision = async () => {
    const res = await fetch('/api/servers/provision', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, instanceType, sshCidr }),
    });
    if (!res.ok) throw new Error('Failed to provision');
    const data = await res.json();
    toast(data.success ? 'Server provisioned and ready.' : data.error, data.success ? 'success' : 'error');
    close();
    queryClient.invalidateQueries(['servers']);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Provision a new EC2 instance</h3>
          <button onClick={close}>&times;</button>
        </div>
        <div className="modal-body">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="production"
            required
            className="rounded border border-border bg-surface text-text px-3 py-2 mb-3 w-full"
          />
          <select
            value={instanceType}
            onChange={e => setInstanceType(e.target.value as any)}
            className="rounded border border-border bg-surface text-text px-3 py-2 mb-3 w-full"
          >
            <option value="t3.micro">t3.micro</option>
            <option value="t3.small">t3.small</option>
            <option value="t3.medium">t3.medium</option>
            <option value="t3.large">t3.large</option>
          </select>
          <div className="mb-3">
            <label className="block text-sm text-text-secondary mb-1">
              Allow SSH from (CIDR)
            </label>
            <input
              value={sshCidr}
              onChange={e => setSshCidr(e.target.value)}
              placeholder="0.0.0.0/0"
              className="w-full rounded border border-border bg-surface text-text px-3 py-2"
            />
            <p className="text-xs text-text-muted mt-1">
              Use your own IP/32 to lock this down; 0.0.0.0/0 allows SSH from anywhere.
            </p>
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={close} className="btn mr-2">Cancel</button>
          <button onClick={handleProvision} className="btn btn-primary">Provision</button>
        </div>
      </div>
    </div>
  );
};
```

## Interactions

### Row Click / Hover

- **Row hover**: `tr:hover` background var(--surface-raised) (existing CSS, preserved in React)
- **Cursor**: pointer on name/row elements
- **Visual feedback**: Hover state provides affordance that rows are interactive

### "Test" Button Per Server

- **Click**: Triggers `testMutation.mutate(serverId)` (React Query mutation)
- **Success**: Toast "SSH OK."
- **Failure**: Toast error with message
- **Visual**: Button may be disabled during test, re-enables after (handled by React Query `isLoading`)

### "Delete" Per Server

- **Click**: Shows confirm modal with:
  - Title: `Delete server "{server.name}"?`
  - Body: "Projects deployed to this server must be reassigned or removed first."
  - Confirm label: "Delete server"
  - On confirm: `deleteMutation.mutate(serverId, true)` (React Query mutation)
  - Success toast: "Server deleted."
  - Then: `queryClient.invalidateQueries(['servers'])` re-fetches list

### "Download Key" Per Server

- **Click**: `<a href={`/api/servers/${server.id}/key`} target="_blank">Download key</a>`
- **Opens**: New tab with SSH private key file
- **Purpose**: User adds this key to their SSH client

### Server Name Click

- **If server is clickable**: navigates/detail view (currently not implemented as link, buttons are used)
- **Currently**: Actions are button-based, not navigation-based
- **Breadcrumb**: Not typically changed on server list (stays "Servers" or context from previous page)

### Modals (Connect / Provision)

- **Connect existing server modal**: Always rendered in UI; on open, shows form; on submit, calls connectMutation; on success, toasts + refetch
- **Provision on AWS modal**: Always rendered in UI; on open, shows form; on submit, calls provisionMutation; on success, toasts + refetch
- Both modals close on Escape click outside, or on cancel button

### Breadcrumb Update

- When on servers page: breadcrumb shows "Servers"
- When navigating from elsewhere: breadcrumb reflects current context
- Clicking "Projects" or "Dashboard" in breadcrumb returns to those pages

## Motion

### Table Row Hover

- `tr:hover` background: var(--surface-raised)
- Transition: 120ms ease (inherited from general transition speeds)
- No abrupt color changes

### Modal Animations

- **Connect/Provision modals**: Use React Transition Group or Framer Motion fade-in (or simple overlay)
- **On reduced motion**: fade duration set to 0.001ms per design system reduced motion media query
- **Delete confirm modal**: Simple fade-in overlay

### Empty State Appearance

- Instant appearance when no servers data received
- No animation needed

### Reduced Motion

- Hover transitions respect `prefers-reduced-motion`
- Modal fade duration respects reduced motion preference
- No essential motion removed

## Responsive Behavior

### Desktop (1440px+, 1280px+)

- Full table with all 5 columns (Name, Host, Provider, Status, Actions) visible
- Action buttons always visible per row
- Horizontal scroll not needed (5 columns fits typical desktop width)
- Modals: form fields fit comfortably; ample width for key textarea

### Laptop (1024px+)

- Table columns mostly visible
- Provider column may be slightly cramped but readable
- Action buttons are touch-friendly (minimum 44px hit area)
- Modals: forms may need slight scrolling but all fields visible

### Tablet (768px+)

- Table may feel cramped with 5 columns
- Consider: should provider column be hidden on tablet? Or horizontal scroll?
- Current implementation: horizontal scroll via `.table-wrap` overflow-x: auto
- Action buttons remain accessible (tap target size adequate)
- Modals: form fields stack vertically naturally; key textarea may need height adjustment

### Mobile Small (430px+)

- Table: horizontal scroll essential; 5 columns becomes difficult to read
- Consider: on mobile, maybe show only Name, Status, and Actions columns
- Or: prioritize columns and hide less critical ones (Provider may be hidden)
- Action buttons: still accessible, may stack vertically below info on very narrow
- Modals: form fields stack vertically; this is the most mobile-friendly layout
  - Name/input pairs become full-width
  - Textarea for key may need height adjustment (from rows: 6 to maybe 4-5 on mobile)
  - Buttons become full-width block targets

### Mobile Smallest (375px-, 390px-)

- Table horizontal scroll possible but awkward for extended use
- Consider: on narrowest mobile, emphasize the "no servers" empty state more
- Modals: all form elements stack; key textarea may be shortened (fewer rows)
- Button tap targets: ensure minimum 44px height (already the case with btn-sm padding)
- Breadcrumb: "Servers" may be truncated but functional

### Empty State Responsiveness

- `.empty-state` or message centers well on mobile
- Padding adjusts, text remains readable
- CTAs become full-width tap targets (block-level)

## Loading State

### Initial Data Load

- **Server list area**: Shows skeleton loader
  - React Query default `isLoading` state
  - Could be enhanced with row-shaped skeletons for table preview
- **Empty state**: Not shown until data confirms no servers exist
- **Action modals**: Always available, not hidden during load
- **CTA buttons**: "Connect existing" and "Provision on AWS" always visible (they're separate modal triggers, not part of the list area)

### API Failure

- **Error handling**: If `/servers` API fails, show error message
- **React Query `isError`**: Shows error boundary or error component
- **User action**: Can retry or navigate elsewhere

### Skeleton Animation

- React Query default skeleton styling
- Could be enhanced with table row-shaped skeletons

## Empty State

### When No Servers Exist

- **Message**: "No servers yet. Connect any Linux box over SSH, or have Forge provision one on AWS."
- **CTAs**: Should include paths to add servers:
  - "Connect existing" - opens connect modal
  - "Provision on AWS" - opens provision modal
- **Visual**: Centered, uses `.empty-state` styles
- **Tone**: Helpful, provides clear next steps

### Recommended Enhancement

Consider adding the CTA buttons within or immediately below the empty state, or ensure the always-available modals are prominently linked from the empty state area. This reduces friction for the first-time user.

### Distinction from "No Projects" Empty State

Similar to the projects empty state distinction, the servers empty state should clearly differentiate:
- "No projects yet" → "Connect a GitHub repo and a server to deploy your first app."
- "No servers yet" → "Connect any Linux box over SSH, or have Forge provision one on AWS."

Different wording for different contexts.

## Accessibility (React + ARIA)

### Keyboard Navigation

- Tab reaches table rows (`<tr>` elements), focus is on row or first interactive child
- Arrow keys: within table, move focus (if implemented) or rely on tab order
- Enter on row: no navigation (actions are button-based)
- "+ Connect existing" and "Provision" CTA buttons: reachable via Tab
- Delete buttons per row: reachable via Tab
- Modals: Escape closes; focus returns to trigger element

### Focus States

- `*:focus-visible` (2px solid var(--accent-strong), outline-offset 2px) on focusable elements
- Table row focus: could add `tabindex="0"` to `<tr>` if focusable, or rely on child buttons
- Button focus: consistent with design system (2px outline, var(--accent-strong))

### Semantic HTML

- `<table>` element for tabular data (name, host, provider, status, actions)
- `<thead>` with `<th>` for column headers: Name, Host, Provider, Status, Actions
- `<tbody>` with `<tr>` for server data rows
- `<td>` for data cells, `<strong>` for server name
- `<button>` elements for all actions (test, delete, download key, modals)
- `<span class="hint mono">` for host IP (monospaced explanation)
- Empty state `<h3>` and `<p>` for copy
- Modals: `<div role="dialog" aria-modal="true">`, `<div role="presentation">` for overlay

### Contrast

- Table text (var --text #e8e6e1) against table backgrounds
- Status pill colors have sufficient contrast (ready: green on var(--surface-raised), etc.)
- Repository hint text (var(--text-muted) #9ca1a8) against var(--surface-raised) - acceptable for secondary text
- Hover background var(--surface-raised) against var(--text) - should be sufficient
- Button contrast: .btn-primary on var(--surface-raised) has good contrast (#0d1216 text on accent bg)
- .btn-danger has var(--danger) on default background - good contrast

### Screen-Reader Structure

- Table headers announced (`<th>` elements provide column context: Name, Host, Provider, Status, Actions)
- Row data announced in sequence per screen reader
- Status pill: text content announced (e.g., "ready", "connecting")
- Button actions have accessible names (button text: "Test", "Delete", "Download key")
- "Download key" link has accessible name + href target description
- Delete confirm modal: has proper role, accessible confirm/cancel actions
- Empty state heading/h3 announced first
- Breadcrumb: "Servers" announced as current page context

### Accessible Forms

- Connect modal: labels associated with inputs (existing app.js `h('label', {}, ...)` pattern adapted to React)
- Required fields have `required` attribute (name, host, key for connect; name, instance type for provision)
- Error messages displayed inline if validation fails
- Form submission has loading state on button
- Delete confirmation is a modal with proper role/aria

### Reduced Motion

- Table row hover effect respects reduced media query
- Modal animations respect reduced motion (0.001ms duration)
- Skeleton animation respects reduced motion
- No essential motion removed - alternatives provided

### Live Region (Enhancement)

- Consider adding `aria-live="polite"` to toast container (#toast-region) so screen readers announce toast messages
- Not currently implemented but would improve accessibility

## Performance (React + React Query)

### API Endpoints

- **GET /servers** - Returns list of all servers with metadata
- **POST /servers/connect** - Connects a new server via SSH
- **POST /servers/provision** - Provisions a new EC2 server
- **POST /servers/{id}/test** - Tests SSH connectivity
- **DELETE /servers/{id}** - Deletes a server
- **Response time**: Should be fast (< 300ms for list, < 500ms for operations) - reads from JSON file store, makes SSH connections (provision/connect may take longer user-perceived but API validates quickly)

### Table Rendering

- One `<tr>` per server, 5+ `<td>` per row
- Typical server count: 1-10 servers (less common to have dozens)
- Performance is fine for typical ranges
- Direct DOM manipulation, no virtual DOM

### Modal Operations

- Connect/provision: API calls that may take user-perceived time (SSH connection, EC2 provisioning)
- API returns quickly (validates inputs, starts async operation)
- Toast feedback user-perceived time
- No polling typically needed for server list (unlike deployments)

### Bundle Impact

- React 18 + React DOM: ~100KB gzipped
- @tanstack/react-query: ~5KB gzipped
- Custom components: minimal
- CSS in existing styles.css - table styles, modals, empty state, pills already defined
- No additional HTTP requests beyond API calls

### Memory

- Server list stored in `useQuery` cache
- No per-server event listeners on server list (event delegation via document handlers if needed)
- Modal state is local to each open/close cycle
- Timers: pollers not typically used for server list (unlike deployments)

## Implementation Notes

### Existing Code Port

The servers list and modals are ported from `app.js` and `public/index.html`. Key mappings:

**Already mapped:**
- API call to `/servers` ✅
- Rendering table with Name, Host, Provider, Status, Actions columns ✅
- Empty state when no servers exist ✅
- Status pill coloring per server state ✅
- "Test" button per server with SSH test ✅
- "Download key" button per server (if has key) ✅
- "Delete" per server with confirm modal ✅
- "Connect existing" modal (always available) ✅
- "Provision on AWS" modal (always available) ✅
- Skeleton loading states ✅

**New (React + TS + React Query):**
- `useQuery` hook for data fetching
- `useMutation` for connect, test, delete, provision
- TypeScript types for server data
- React component structure (JSX vs innerHTML)
- React Query for state management and caching
- Always-rendered modal components (vs original index.html conditional hidden)
- React state for form inputs in modals

**Enhancements from React version:**
- React Query handles data caching and refetching
- Form state management with React state (vs ad-hoc in app.js)
- Type safety across the component
- Better error handling and validation
- Easy retry on form submission
- Always-available modal components (better UX than original conditional approach)
- Test mutation handles SSH test result parsing

### API Contract

The `/servers` API endpoint should return JSON with this shape:

```json
[
  {
    "id": "server-uuid",
    "name": "production-server",
    "host": "3.110.221.4",
    "provider": "ec2" | "existing",
    "status": "ready" | "connecting" | "provisioning" | "bootstrap_failed",
    "hasKey": boolean,
    // ... other fields
  }
]
```

Key fields needed for the table: `name`, `host`, `provider`, `status`, `hasKey`.

### Component Integration

- **Server table**: Should use the established `.table` / `.table-wrap` pattern
- **Status pills**: Should reference CSS variables var(--success)/var(--warning)/var(--danger) per status value
- **Empty state**: Should use the React EmptyState component with CTA buttons
- **Action buttons**: Test/download/delete should use .btn .btn-sm patterns consistently
- **Modals**: Connect and provision should use the React modal components adapted from original index.html

### Visual Refinements to Apply

1. **Table striping**: Add `tr:nth-child(even) { background: var(--surface-raised); }` for improved readability
2. **Status pill consistency**: Ensure pills use same `.pill` component as other pages (12px, border-radius 999px, etc.)
3. **Empty state CTAs**: Ensure "Connect existing" and "Provision on AWS" paths are clear from empty state
4. **Monospaced hostname**: Add ellipsis or truncation if host IP overflows table cell
5. **Button consistency**: Test/download/delete buttons should match established patterns
6. **Modal form labels**: Ensure labels are properly associated with inputs in connect/provision modals
7. **Provider display**: Should be concise ("AWS EC2" vs "Existing") with appropriate styling
8. **Hover row style**: Ensure `tr:hover td { background: var(--surface-raised); }` works correctly with border styles

### Testing Checklist (React + TS + React Query)

- [ ] Servers list loads with sample data
- [ ] Empty state shown when no servers exist
- [ ] "Connect existing" modal opens and works
- [ ] "Provision on AWS" modal opens and works
- [ ] "Test" button per server tests SSH and shows toast
- [ ] "Download key" per server opens new tab with key
- [ ] "Delete" per server shows confirm modal and deletes on confirm
- [ ] Status pills color-code correctly (ready=green, connecting/provisioning=amber, bootstrap_failed=red)
- [ ] Table hover background changes
- [ ] Horizontal scroll available on `.table-wrap` if needed at narrow widths
- [ ] Skeleton loading shown before API resolves
- [ ] Error message shown when API fails
- [ ] Focus-visible outlines on interactive elements
- [ ] Table grid responsive at mobile breakpoints
- [ ] Empty state message is clear and CTAs are prominent
- [ ] Pill colors have sufficient contrast
- [ ] Host hint text is readable but secondary
- [ ] Delete confirm modal works correctly
- [ ] Modal forms have proper labels and validation
- [ ] "Download key" link works and opens in new tab
- [ ] Breadcrumb shows "Servers" when on this page
- [ ] Connect modal: name and host are required, key is required
- [ ] Provision modal: instance type select works, CIDR has reasonable default
- [ ] TypeScript types compile without errors

## Visual References

- Original implementation in `app.js` `loadServers()` function (lines 847-886)
- Design tokens in `public/styles.css` `:root` variables
- IBM Plex Sans / IBM Plex Mono font stack
- Color palette from existing styles.css (dark theme default)
- AWS EC2 console inspiration - server list with status indicators
- SSH connection flow patterns from DevOps UIs
- Table row hover patterns from admin dashboards
- Empty state onboarding patterns (helpful, with clear CTAs)
- Modal form patterns for SSH key entry and EC2 provisioning
- "Connect existing" vs "Provision" distinction in infrastructure UIs