# Settings (React + TypeScript)

## Purpose (Updated)

The Settings page allows users to configure Forge's integrations with GitHub and AWS, manage authentication, and adjust instance-wide preferences. It serves as the administrative control panel for the Forge instance. Users come here to connect their GitHub account, save AWS credentials, and configure instance-wide settings that affect how projects deploy and operate.

Built with **React + TypeScript + React Hook Form + Zod**, replacing the vanilla JS `app.js` `loadSettings()` function.

## User Goal

- Connect or disconnect GitHub account using personal access token
- View GitHub connection status and login name
- Save AWS access credentials (access key ID, secret access key, region)
- View AWS configuration status (whether keys are saved, using instance profile)
- Update AWS region setting
- Understand what each configuration enables
- Receive clear feedback on success/failure of configuration changes
- Navigate back to the main interface

## Layout (React Components)

### Top Section: GitHub Integration

- **Component**: `<GitHubIntegration />`
- **Two states**:

#### State A: GitHub Connected

- **Connection status**: `<p>Connected as <span className="font-medium">{login}</span></p>` with pill `.pill pill-success`
- **CTA**: `<Button variant="danger" size="sm">Disconnect</Button>` to revoke connection
- **Help text**: `<p className="text-text-muted text-xs">Needs repo scope. Create one at github.com → Settings → Developer settings → Personal access tokens.</p>`

#### State B: GitHub Not Connected

- **Status prompt**: `<p>Forge needs a GitHub personal access token to list and deploy your repositories.</p>`
- **Token input**: `<Input placeholder="ghp_…" />` (or custom input with type=password)
- **Connect form**: `<form onSubmit={handleConnect}>` with token input and "Connect" primary button
- **Help text**: Same as above

### Middle Section: AWS Configuration

- **Component**: `<AwsConfiguration />`
- **Two states**:

#### State A: AWS Configured (using instance profile or saved keys)

- **Status text**: `<p>Configured for region <span>{region}</span>.</p>` or `<p>Using this box's own EC2 instance profile for AWS access.</p>`

#### State B: AWS Not Configured

- **Status prompt**: `<p>No keys saved — Forge will use this instance's own EC2 IAM role if it has one, needed only if you want Forge to provision new EC2 servers for you.</p>`
- **Configuration form**: 
  - `<Input placeholder="AKIA…" label="Access key ID" />`
  - `<Input type="password" placeholder="secret access key" label="Secret access key" />`
  - `<Input value={region} label="Region" />`
- **Region help text**: `<p className="text-text-muted text-xs">Use your own IP/32 to lock this down; 0.0.0.0/0 allows SSH from anywhere.</p>`

### Bottom Section: Form Submission Feedback

- **Toast notifications**: Success ("AWS settings saved.") or error ("err.message")
- **Form reset**: Fields may clear or remain after submit (React Hook Form default: keep values, could reset)

### Breadcrumbs

- **Location**: Topbar component, below sidebar indicator
- **Content**: "Settings"
- **Purpose**: Shows current page context; clicking "Projects" or "Dashboard" returns to those pages

## Data Fetching (React Query + React Hook Form)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

// Schema for GitHub token validation
const githubSchema = z.object({
  token: z.string().min(1).startsWith('ghp_'),
});

// Schema for AWS settings
const awsSchema = z.object({
  accessKeyId: z.string().min(1).startsWith('AKIA'),
  secretAccessKey: z.string().min(1),
  region: z.string().min(1),
});

function useSettings() {
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings', {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    },
    staleTime: 60000,
  });

  const form = useForm({
    defaultValues: {
      githubToken: settingsData?.github?.connected ? /* existing token */ : '',
      accessKeyId: settingsData?.aws?.accessKeyId || '',
      secretAccessKey: settingsData?.aws?.secretAccessKey || '',
      region: settingsData?.aws?.region || '',
    },
    resolver: zodResolver(awsSchema), // for AWS form
    // github form has its own validation
  });

  const { register, handleSubmit, watch, reset } = form;

  // GitHub Connect Mutation
  const { mutate: githubMutate, isPending: isGitHubPending } = useMutation({
    mutationFn: async (data: { token: string }) => {
      const res = await fetch('/api/settings/github', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.token }),
      });
      if (!res.ok) throw new Error('GitHub connection failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['settings']);
      toast('GitHub connected.', 'success');
    },
    onError: (err) => {
      toast(err.message, 'error');
    },
  });

  // AWS Save Mutation
  const { mutate: awsMutate, isPending: isAwsPending } = useMutation({
    mutationFn: async (data: { accessKeyId: string; secretAccessKey: string; region: string }) => {
      const res = await fetch('/api/settings/aws', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('AWS settings save failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['settings']);
      toast('AWS settings saved.', 'success');
    },
    onError: (err) => {
      toast(err.message, 'error');
    },
  });

  return {
    settings: settingsData,
    form,
    register,
    handleSubmit,
    watch,
    reset,
    githubMutate,
    isGitHubPending,
    awsMutate,
    isAwsPending,
  };
}
```

## Components

### GitHubIntegration

```typescript
function GitHubIntegration({ settings, onFormSubmit }: { settings: any; onFormSubmit: (data: any) => void }) {
  const [connected, setConnected] = useState(settings?.github?.connected || false);
  const [login, setLogin] = useState(settings?.github?.login || '');

  if (connected) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-text-secondary">
          <pill variant="success" /> connected as {login}
        </span>
        <Button variant="danger" size="sm" onClick={() => handleDisconnect()}
          >Disconnect</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((data) => onFormSubmit(data))} className="space-y-4">
      <Input
        type="password"
        placeholder="ghp_…"
        {...register('token', { required: true, minLength: 10 })}
        className="w-full"
      />
      <Button type="submit" variant="primary" disabled={isGitHubPending}>
        {isGitHubPending ? 'Connecting…' : 'Connect'}
      </Button>
      <p className="text-text-muted text-xs">
        Needs repo scope. Create one at github.com → Settings → Developer settings → Personal access tokens.
      </p>
    </form>
  );
}
```

### AwsConfiguration

```typescript
function AwsConfiguration({ settings, onFormSubmit }: { settings: any; onFormSubmit: (data: any) => void }) {
  const [configured, setConfigured] = useState(settings?.aws?.configured || false);
  const [usingInstanceProfile, setUsingInstanceProfile] = useState(settings?.aws?.usingInstanceProfile || false);
  const [region, setRegion] = useState(settings?.aws?.region || '');
  const [accessKeyId, setAccessKeyId] = useState(settings?.aws?.accessKeyId || '');
  const [secretAccessKey, setSecretAccessKey] = useState(settings?.aws?.secretAccessKey || '');

  if (configured || usingInstanceProfile) {
    return (
      <div>
        {usingInstanceProfile ? (
          <p>Using this box's own EC2 instance profile for AWS access.</p>
        ) : (
          <p>Configured for region <span>{region}</span>.</p>
        )}
        {/* Option to update keys still shown */}
        <form onSubmit={handleSubmit((data) => onFormSubmit(data))}>
          <Input placeholder="AKIA…" {...register('accessKeyId', { required: true })} />
          <Input type="password" placeholder="AKIA… secret" {...register('secretAccessKey', { required: true })} />
          <Input placeholder={region} {...register('region', { required: true })} />
          <Button type="submit" variant="primary">Save</Button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((data) => onFormSubmit(data))} className="space-y-4">
      <Input placeholder="AKIA…" {...register('accessKeyId', { required: true })} />
      <Input type="password" placeholder="secret access key" {...register('secretAccessKey', { required: true })} />
      <Input placeholder={region || 'us-east-1'} {...register('region', { required: true })} />
      <p className="text-text-muted text-xs">
        Use your own IP/32 to lock this down; 0.0.0.0/0 allows SSH from anywhere.
      </p>
      <Button type="submit" variant="primary">Save</Button>
    </form>
  );
}
```

## Interactions

### GitHub Connect/Disconnect

- **Connect**:
  1. User enters PAT in token input
  2. Clicks "Connect" button (disabled during API call)
  3. Toast: "GitHub connected."
  4. `queryClient.invalidateQueries(['settings'])` refetches settings
  5. UI updates to connected state (shows pill + username + disconnect button)
  6. Form fields may clear or remain (React Hook Form default: keep values)

- **Disconnect**:
  1. User clicks "Disconnect" button (shown when connected)
  2. `api('/settings/github', { method: 'DELETE' })` called (or useMutation)
  3. Toast: "GitHub disconnected." (or implicit success)
  4. `queryClient.invalidateQueries(['settings'])` refetches settings
  5. UI reverts to "not connected" state
  6. Shows connect form again

### AWS Save

- **Update keys/region**:
  1. User fills in access key ID, secret access key, and/or region
  2. Clicks "Save" button (disabled during API call)
  3. Toast: "AWS settings saved."
  4. `queryClient.invalidateQueries(['settings'])` refetches settings
  5. UI updates to reflect new configuration
  6. Form fields remain filled (React Hook Form default behavior)

### Form Validation (React Hook Form + Zod)

- **GitHub token**: Should have `ghp_` prefix (validated via Zod schema `z.string().startsWith('ghp_')`)
- **AWS keys**: Should start with `AKIA` (access key ID) and be non-empty (Zod validation)
- **Region**: Should be a valid AWS region name (could add list validation, but current code uses free-form text)
- **Current implementation**: Zod schemas provide client-side validation; relies on server-side validation in API

### Breadcrumb Update

- When on settings page: breadcrumb shows "Settings"
- When navigating from projects or dashboard: breadcrumb reflects previous context
- Clicking "Projects" or "Dashboard" in breadcrumb returns to those pages

## Motion

### Form State Transitions

- **Button disable/enable**: During API call, submit button `disabled = true` (React Hook Form `isPending` from useMutation)
- **Toast appearance**: Success/error toast appears at bottom-right, auto-removes after 5000ms
- **Form re-fetch**: `queryClient.invalidateQueries(['settings'])` called after successful save, UI updates synchronously

### Reduced Motion

- Toast 5000ms duration may or may not respect `prefers-reduced-motion` (currently fixed, could be made conditional)
- No essential animation that would degrade experience

## Responsive Behavior

### Desktop (1440px+, 1280px+)

- Full settings layout with both GitHub and AWS sections visible
- GitHub form: fits comfortably
- AWS form: form-layout with access key ID + secret key on same row, region below
- All form inputs have adequate width
- Toast notifications appear without obstruction

### Laptop (1024px+)

- Similar to desktop but forms may be slightly narrower
- All inputs still readable and tap-target acceptable
- No horizontal scrolling needed for forms

### Tablet (768px+)

- Forms stack vertically more naturally
- GitHub: token input may be full-width, button below on small screens
- AWS: form elements stack - access key above secret key, region below
- Inputs remain usable; touch targets adequate

### Mobile Small (430px+)

- Forms become single-column stacked layouts
- GitHub: token input (full width), then "Connect" button (full width, block)
- AWS: each input on its own row (access key ID, secret access key, region)
- Save button: full-width, block
- Help text: may be smaller or condensed, but still readable
- Toast notifications: still appear at bottom, not obscured by keyboard

### Mobile Smallest (375px-, 390px-)

- Same as mobile small - forms naturally stack
- All tap targets are full-width, easy to hit
- Help text may be reduced to 12px but still readable
- Breadcrumb: "Settings" may be truncated but functional

### Empty State (not applicable)

- Settings page always has content (either "connected" form or "not connected" form)
- No true "empty state" - always either configured or not configured
- However, could consider: if user has never visited settings, could show welcome/guidance, but current implementation always shows one of the two states

## Loading State

### Initial Page Load

- **GitHub section**: Shows current status (connected or not) immediately on page load
  - If connected: shows pill + username + disconnect button
  - If not connected: shows prompt + token form
- **AWS section**: Shows current status immediately on page load
  - If configured: shows region + form to update
  - If not configured: shows prompt + key/region form
- **No skeleton loaders** on settings page (data is quick to fetch from `/settings` API)
- **Button states**: Save/Connect buttons enabled initially

### API Data Fetch (`/settings`)

- **GET /settings** - Returns GitHub connection status and AWS configuration
- **While loading**: Not really needed - settings fetch is quick; if desired, could show simple text "Loading settings…" but current implementation doesn't show skeletons
- **On success**: UI updates to reflect current configuration
- **On error**: Could show error message, but current code has `.catch {}` that silently fails (could enhance)

### Form Submission

- **During API call**: Submit button `disabled = true` (existing code pattern, React Hook Form `isPending`)
- **After success**: Button re-enabled, toast appears, `queryClient.invalidateQueries(['settings'])` re-fetches
- **After error**: Button re-enabled, toast with error message

### Error State

- **API failure** (`/settings/github` or `/settings/aws`):
  - Toast: err.message
  - Button re-enabled
  - UI may show stale state until user reloads or retry
- **Current code**: `.catch((err) => { toast(err.message, 'error'); })` pattern used in form submit handlers

## Empty State

### Not Really Applicable

- The settings page always displays one of two states:
  1. **Configured**: "Here's your current config, change it below"
  2. **Not configured**: "Here's how to configure, fill in the forms below"
- There is no "no data" state where the page would be empty
- However, could consider: if this is a fresh Forge install, the GitHub section will show "not connected" which is the default/expected state

### Possible Enhancement

For first-time users, could add subtle guidance text: "Welcome! Connect GitHub to list your repositories and configure AWS to provision servers on your behalf." But this would be a minor enhancement over the current "not connected" prompt.

## Accessibility (React + ARIA)

### Keyboard Navigation

- Tab reaches form inputs (token, key, region) and submit buttons
- Shift+Tab navigates backwards
- Enter activates submit buttons
- Escape: not typically needed (no modals on this page, but good practice)
- Focus order: GitHub section → AWS section → Save button at bottom (or within each section)

### Focus States

- `*:focus-visible` (2px solid var(--accent-strong), outline-offset 2px) on all focusable elements
- Form inputs: on focus, border-color changes to var(--accent) (existing input CSS)
- Submit buttons: on focus, consistent with design system (2px outline)
- GitHub connect button: focusable, has visual feedback
- AWS save button: focusable, has visual feedback

### Semantic HTML

- `<form>` elements for both GitHub connect and AWS save forms
- `<input type="password">` for token and secret key inputs
- `<input type="text">` for region input
- `<button type="submit">` for Connect and Save buttons
- `<div class="pill pill-success">` for connected status indication
- `<p className="text-text-muted text-xs">` for help text (e.g., "Needs repo scope...")
- `<strong>` for connection status text (e.g., "connected as")
- `< div class="inline-row">` and **`.form-row>` for layout
- Topbar breadcrumb: `<div class="breadcrumb">` with contextual text

### Contrast

- Form input backgrounds: var(--surface-raised) against var(--border-strong) - should meet WCAG AA
- Text color: var(--text) (#e8e6e1) on var(--surface-raised) - good contrast
- Pill colors: success green, warning amber, danger red against var(--surface-raised) - should meet contrast
- Hint text: var(--text-muted) (#9ca1a8) against var(--surface-raised) - acceptable for secondary text (3:1 may be borderline but UI convention)
- Button text: .btn primary has #0d1216 on var(--accent) (or var(--accent-strong)) - good contrast
- .btn-danger has var(--danger) on default background - good contrast

### Screen-Reader Structure

- Form labels associated with inputs (existing pattern in app.js adapted to React Hook Form)
- "Connected as {username}" text announced with the username value
- Pill "connected" status announced
- "Disconnect" button has accessible name (button text)
- "Connect" button has accessible name
- Help text announced as supplementary information
- Region text announced
- "AWS settings saved." toast announced (via live region or announcement)

### Accessible Forms

- Labels explicitly associated with inputs (React Hook Form register function)
- Required fields: GitHub token not formally required (could add `required` attribute, but current code doesn't)
- AWS key/region: not formally required in current code
- Error messages displayed inline if validation fails
- Form submission has loading state on button
- No modals on this page (simplifies accessibility)

### Reduced Motion

- No essential animation on settings page
- Toast 5000ms duration may or may not respect reduced media query (currently fixed in app.js)
- Button disable/enable is instant, no animation dependency
- No motion-reduced user sees broken UI

### Live Region (Enhancement)

- Consider adding `aria-live="polite"` to areas where toast messages appear, or ensure the existing `#toast-region` has appropriate live region properties
- Not currently implemented but would improve accessibility

## Performance (React + React Query + React Hook Form)

### API Endpoints

- **GET /settings** - Returns GitHub connection status and AWS configuration
- **POST /settings/github** - Connects or disconnects GitHub
- **POST /settings/aws** - Saves AWS access keys and region
- **Response time**: Should be fast (< 200ms for GET, < 300ms for POST) - reads/writes to JSON file store
- **No heavy computation**: Simple file reads, no external service calls during GET

### Form Performance

- Form inputs are simple text/password fields - no validation overhead beyond Zod
- Submit buttons disable instantly on click (React Hook Form `isPending`)
- Toast appears after API resolves (typically < 500ms)
- `queryClient.invalidateQueries(['settings'])` re-fetches and updates UI synchronously

### Bundle Impact

- React 18 + React DOM: ~100KB gzipped
- @tanstack/react-query: ~5KB gzipped
- react-hook-form: ~7KB gzipped
- zod: ~3KB gzipped
- Custom components: minimal
- CSS in existing `styles.css` - form styles, pills, buttons already defined
- Total additional: ~115-120KB gzipped (acceptable increase)

### Memory

- Settings data stored in `useQuery` cache + React Hook Form state
- No per-setting event listeners (event delegation if needed)
- Form state is local to each submission cycle

## Implementation Notes

### Existing Code Port

The settings page is ported from `app.js` `loadSettings()` function (lines 968-1027). Key mappings:

**Already mapped:**
- API call to `/settings` ✅
- GitHub connection status display ✅
- GitHub connect form and submit ✅
- GitHub disconnect functionality ✅
- AWS configuration status display ✅
- AWS key/region form ✅
- AWS save form submit ✅
- Toast feedback for all operations ✅
- `queryClient.invalidateQueries(['settings'])` re-fetch and UI update ✅
- Breadcrumb update ✅

**New (React + TS + React Query + React Hook Form):**
- `useQuery` hook for initial settings fetch
- `useMutation` for GitHub connect/disconnect and AWS save
- TypeScript types for all data shapes
- React Hook Form for form state management
- Zod for schema validation
- React Query for cache invalidation and refetching

**Enhancements from React version:**
- React Query handles data caching and stale-while-revalidate
- React Hook Form provides form state management with validation (vs ad-hoc in app.js)
- TypeScript types across the component
- Better error handling and validation (Zod schemas)
- Easy cache invalidation (queryClient.invalidateQueries)
- Improved testability with @testing-library/react + React Hook Form
- Zod schema validation for client-side validation before API calls

**Still needing port:**
- Inline styles: `style="flex:1"`, `style="placeholder: 'ghp_…'"`, etc. → CSS classes
- Help text styling: "Needs repo scope." and similar text should use `.hint` class consistently
- Pill consistency: GitHub connected pill `.pill pill-success` should match pill pattern elsewhere
- Inline style removal: Move inline styles to CSS classes where possible
- Button text: "Connect" and "Save" should be consistent primary button pattern
- Status text hierarchy: Distinguish between "Configured for region..." and "No keys saved..." with clear visual distinction

### API Contract

The `/settings` API endpoint should return JSON with this shape:

```json
{
  "github": {
    "connected": boolean,
    "login": string | null
  },
  "aws": {
    "usingInstanceProfile": boolean,
    "configured": boolean,
    "region": string
  }
}
```

Or the format that the existing code expects. Key fields: `github.connected`, `github.login`, `aws.usingInstanceProfile`, `aws.configured`, `aws.region`.

### Component Integration

- **GitHub section**: Should use React Hook Form + Zod for validation, with `.pill pill-success` for connected state
- **AWS section**: Should use React Hook Form + Zod for validation, with form layout .form-row / .inline-row
- **Status pills**: GitHub connected pill: `.pill pill-success` should match pill pattern elsewhere
- **Forms**: Should use established form patterns from design system (input sizes, label positioning, button styles)
- **Toast feedback**: Should use existing toast system (.toast, .toast-region, 5000ms duration)

### Visual Refinements to Apply

1. **Form row gap**: Ensure `.form-row` has consistent gap (12px from design system)
2. **Help text**: All helper text should use `.hint` class (12px, color var(--text-muted))
3. **Pill consistency**: GitHub connected pill `.pill pill-success` should match pill pattern elsewhere
4. **Inline style removal**: Move `style="flex:1"`, `style="placeholder: 'ghp_…'"`, etc. to CSS classes
5. **Button text**: "Connect" and "Save" should be consistent primary button pattern
6. **Status text hierarchy**: Distinguish between "Configured for region..." and "No keys saved..." with clear visual distinction
7. **Region display**: Should be prominent but secondary to the key inputs
8. **Toast placement**: #toast-region at bottom-right, ensure it doesn't obscure form inputs on mobile

### Testing Checklist (React + TS + React Query + React Hook Form)

- [ ] Settings page loads with current configuration
- [ ] GitHub section shows correct state (connected/unconnected)
- [ ] GitHub connect form: enters PAT, clicks Connect, toast appears, UI updates
- [ ] GitHub disconnect: shows disconnect button when connected, clicks it, UI updates to unconnected state
- [ ] AWS section shows correct state (configured/unconfigured/instance profile)
- [ ] AWS form: fills in access key ID, secret access key, region, clicks Save, toast appears, UI updates
- [ ] Focus-visible outlines on all focusable elements (inputs, buttons)
- [ ] Help text is readable and uses proper styling
- [ ] Pill colors have sufficient contrast (GitHub connected: green)
- [ ] Form inputs have adequate width/tap targets on mobile
- [ ] Breadcrumb shows "Settings" when on this page
- [ ] Error toast appears on failed API calls (invalid token, invalid keys, etc.)
- [ ] Button disabled state during API call, re-enables after
- [ ] Mobile form stacking works (fields become full-width, one per row)
- [ ] Help text is visible and not cut off
- [ ] "Needs repo scope." and similar text is clear and helpful
- [ ] AWS region help text is visible and explanatory
- [ ] TypeScript types compile without errors
- [ ] Zod validation works (prevents submission of invalid format)

## Visual References

- Original implementation in `app.js` `loadSettings()` function (lines 968-1027)
- Design tokens in `public/styles.css` `:root` variables
- IBM Plex Sans / IBM Plex Mono font stack
- Color palette from existing styles.css (dark theme default)
- GitHub settings page inspiration - personal access token management
- AWS console inspiration - EC2 credential management
- Form design patterns from existing Forge UI
- Status pill patterns from other pages (projects, servers)
- Help text patterns from existing UI components
- Toast notification patterns from throughout the application
- React Hook Form examples and patterns
- Zod schema validation patterns