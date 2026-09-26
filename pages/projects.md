# Projects (React + TypeScript)

## Purpose (Updated)

The Projects page lists all registered projects in Forge, showing their repository information, branch, health status, and deployment history. It serves as the central registry for everything the developer has configured. Users come here to discover existing projects, check health status, and navigate to project details or create new projects.

Built with **React + TypeScript + React Query**, replacing the vanilla JS `app.js` `loadProjects()` function.

## User Goal

- Browse all registered projects at a glance
- Quickly assess the health of each project
- Navigate to a specific project's detail page
- Create a new project (CTA: "+ New project" button)
- Understand which branches and repositories are configured
- Identify projects that need attention (unhealthy state)

## Layout (React Components)

### Header Section

- **Component**: `<Panel><h2>Projects</h2><Button variant="primary">New Project</Button></Panel>`
- **Purpose**: Section title and primary CTA
- **Content**:
  - `<h2>Projects</h2>` - section title (18px, font-weight 600)
  - `+ New project` button (`.btn btn-primary`) - primary action to create a new project

### Main Content Area

Two states, similar to original but as React components:

#### State A: Projects Exist (table view)

- **Component**: `<ProjectTable projects={projects} />`
- **Content**: HTML table with columns:
  - Name (project name, bold, clickable to detail view)
  - Repository (repo full name, monospaced hint, truncated if long)
  - Branch (current branch name)
  - Health (Pill component showing state: healthy/unblocked / unhealthy / unknown)
  - Last deploy (time ago, e.g., "2h ago", "3d ago")
  - Action column (→ button to open project)
- **Row styling**: 
  - Hover state: background var(--surface-raised)
  - Cursor: pointer
  - Click: navigates to project detail
  - Alternating row stripes optional

#### State B: No Projects (empty state)

- **Component**: `<EmptyState title="No projects yet" description="Connect a GitHub repo and a server to deploy your first app." cta="+ New project" />`
- **Purpose**: Onboard user, explain what to do next, provide primary CTA

## Data Fetching (React Query)

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';

function useProjects() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects', {
        credentials: 'same-origin',
        headers: { 'X-Forge-Client': '1' },
      });
      if (!res.ok) throw new Error('Projects API failed');
      return res.json();
    },
    staleTime: 60000, // 1 minute
  });

  const { mutate: createMutation } = useMutation({
    mutationFn: async (newProject: NewProjectForm) => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Forge-Client': '1' },
        body: JSON.stringify(newProject),
      });
      if (!res.ok) throw new Error('Failed to create project');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['projects]); // refetch projects list
      toast('Project created.', 'success');
    },
  });

  return { projects: data, isLoading, isError, createMutation };
}
```

## Components

### ProjectTable

```typescript
interface ProjectRowProps {
  project: Project;
  onViewDetail: (projectId: string) => void;
}

function ProjectRow({ project, onViewDetail }: ProjectRowProps) => {
  const healthClass = `pill pill-${project.health}`; // pill-success / pill-danger / pill-neutral
  
  return (
    <tr 
      className="hover:bg-surface-raised cursor-pointer transition-colors"
      onClick={() => onViewDetail(project.id)}
    >
      <td className="font-medium">
        <a href="#">{{ project.name }}</a>
      </td>
      <td className="text-sm text-text-muted font-mono whitespace-nowrap">
        {project.repoFullName.length > 50 ? 
          `${project.repoFullName.substring(0, 47)}...` : project.repoFullName}
      </td>
      <td className="font-medium">{{ project.branch }}</td>
      <td>
        <span className={healthClass}>
          {project.health}
        </span>
      </td>
      <td className="text-sm text-text-muted">
        {project.lastDeployedAt ? timeAgo(project.lastDeployedAt) : 'Never'}
      </td>
      <td>
        <Button variant="ghost" size="sm">Open →</Button>
      </td>
    </tr>
  );
}
```

### EmptyState (React version)

```typescript
interface EmptyStateProps {
  title: string;
  description: string;
  cta?: { label: string; onClick: () => void; variant?: 'primary' | 'ghost' };
}

function EmptyState({ title, description, cta }: EmptyStateProps) => {
  return (
    <div className="text-center py-12 text-text-secondary">
      <h3 className="text-text mb-3">{title}</h3>
      <p>{description}</p>
      {cta && (
        <Button variant={cta.variant || 'primary'} onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </div>
  );
};
```

## Interactions

### Row Click Navigation

- **Project name**: `<a>` element or `<td>` has `onClick` handler to `onViewDetail(project.id)`
- **Row click**: `onClick` on `<tr>` element also navigates to detail view (prevent default if needed)
- **Visual feedback**: `tr:hover` background change via CSS, `useHover` hook from React Spectrum or simple CSS
- **Breadcrumb update**: Changes from "Projects" to "Projects / {project name}"

### "+ New Project" Button

- **Opens**: New project creation modal (React component, not inline modal)
- **Prerequisites check**:
  - Checks if any servers exist (if not, shows modal to add server first)
  - Checks if GitHub is connected (if not, shows modal to connect GitHub first)
- **Flow**:
  1. Click "+ New project"
  2. If no servers: show modal "Add a server first"
  3. If no GitHub connection: show modal "Connect GitHub first"
  4. If both exist: show repository selection modal
- **CTA text**: "+ New project" on button

### Project Navigation

- Clicking project name/row navigates to project detail page
- Breadcrumb changes: "Projects" → "Projects / {project name}"
- View title changes from "Projects" to "Projects / {project name}"
- "← All projects" button appears in project detail header (returns to projects list)

### Modal Handling (React)

- Repository select → branch select → project creation form
- Form validation: required fields (repo, branch, project name, port)
- Submit: creates project, toasts success, reloads projects list, opens project detail
- Cancel: closes modal without changes
- Uses React state + React Query for mutates

## Motion

### Table Row Hover

- `tr:hover` background: var(--surface-raised)
- Transition: 120ms ease (inherited from general transition speeds)
- No abrupt color changes

### New Project Modal

- Modal fade-in (using React Transition Group or Framer Motion)
- Form fields appear sequentially as user progresses (repo select → branch → form)
- Button states: disabled during API calls, re-enabled after
- Form submit: button text "Create project" → "Creating..." → "Create project" (reverts on error)

### Empty State Appearance

- Instant appearance when no projects data received
- No animation needed - content simply displays or hides

### Reduced Motion

- Hover transitions respect `prefers-reduced-motion`
- Modal animations respect reduced motion (can be disabled via media query)
- No essential motion that would degrade experience if disabled

## Responsive Behavior

### Desktop (1440px+, 1280px+)

- Full table with all 6 columns visible
- Horizontal overflow: auto on table wrapper (already in CSS)
- "Open →" button always visible
- No wrapping needed

### Laptop (1024px+)

- Table columns mostly visible
- Repository name may truncate with text-overflow ellipsis
- Horizontal scroll still available if needed

### Tablet (768px+)

- Table may become cramped
- Consider stack layout on very narrow tablets
- Horizontal scroll available via table wrapper overflow-x: auto
- "Open →" button still accessible

### Mobile Small (430px+)

- Table transforms to single-column stack or full horizontal scroll
- Consider: should we show a "stacked" view on mobile?
- Current implementation: horizontal scroll via table-wrapper
- "Open →" button is top-aligned or stacked below info
- Content padding: 16px (reduced from 24px)

### Mobile Smallest (375px-, 390px-)

- Horizontal scroll possible but awkward
- Consider: on narrow mobile, show "No projects" empty state message more prominently
- Breadcrumb: "Projects" may be truncated, but okay
- Button: "+ New project" is full-width, easy to tap

### Empty State Responsiveness

- `.empty-state` is center-aligned, max-width implicit
- On mobile: padding adjusts, text remains readable
- Button becomes full-width tap target (already block-level)

## Loading State

### Initial Data Load

- **Project list area**: Shows skeleton loader(s)
  - React Query default `isLoading` state
  - Could show `SkeletonProjectRow` components for each project row
- **Empty state**: Not shown until data confirms no projects exist
- **CTA button**: "+ New project" is always visible (not hidden during load)

### API Failure

- **Error handling**: If `/projects` API fails, show error message
- **React Query `isError`**: Shows error boundary or error component
- **User action**: Can retry by navigating away and back, or refreshing

### Skeleton Animation

- React Query default skeleton styling
- May be improved with row-shaped skeletons for better visual feedback

## Empty State

### Encouragement Message

- **Heading**: "No projects yet"
- **Description**: "Connect a GitHub repo and a server to deploy your first app."
- **CTA**: "+ New project" button (primary, full-width)
- **Visual**: Centered, spacious, uses existing empty state styles
- **Tone**: Helpful, not discouraging - tells user exactly what to do next

### When Error Occurs (API failure)

- **Different from "no projects" empty state**
- Shows error message instead of encouraging message
- Still has CTA to try again or navigate elsewhere
- Visual: error state, not the standard empty state

### Recommended Enhancement

Consider two different empty state styles:
1. **No projects ever**: Friendly onboarding message with "Create your first project" CTA
2. **No data / error**: Warning/message about what went wrong + retry action

This distinction improves UX by not conflating "you haven't set up anything yet" with "something went wrong."

## Accessibility (React + ARIA)

### Keyboard Navigation

- Tab reaches table rows (`<tr>` elements), focus is on the `<tr>` element or first interactive child
- Arrow keys: within table, move focus row by row (if implemented)
- Enter on row: navigates to project detail (same as click)
- "+ New project" button: reachable via Tab, clickable
- "← All projects" button in project detail: reachable

### Focus States

- `*:focus-visible`: 2px solid var(--accent-strong), outline-offset 2px (consistent with design system)
- Table rows could have `tabindex="0"` to be focusable, or rely on child elements
- Hover + focus distinction: `:hover` is mouse-only, `:focus-visible` is keyboard

### Semantic HTML

- `<table>` element for tabular data (name, repo, branch, health, deploy, action)
- `<thead>` with `<th>` for column headers
- `<tbody>` with `<tr>` for project data rows
- `<td>` for data cells, `<strong>` for project name
- `<button>` elements for actions (never `<a>` for button actions in table)
- Empty state `<h3>` and `<p>` for copy
- Form `<button>` for "New project" CTA

### Contrast

- Table text (var --text #e8e6e1) against table backgrounds
- Pill colors have sufficient contrast (success: #7cae8a on var(--surface-raised), etc.)
- Repository hint text (var(--text-muted) #9ca1a8) against var(--surface-raised) - may need 3:1 check but acceptable for secondary text
- Hover background var(--surface-raised) against var(--text) - should be sufficient
- "Open →" button has sufficient contrast

### Screen-Reader Structure

- Table headers announced (`<th>` elements provide column context)
- Row data announced in sequence per screen reader
- "Open →" button has accessible name (button text)
- Project name in `<a>` or `<strong>` is announced
- Repository name as monospaced hint is announced (may be announced as code)
- Empty state heading/h3 is announced first
- Breadcrumb context: "Projects" → "Projects / {name}"

### Accessible Forms

- New project form has proper labels associated with inputs (existing pattern adapted to React Hook Form)
- Required fields have `required` attribute
- Error messages displayed inline if validation fails
- Form submission has loading state on button

### Reduced Motion

- Table row hover effect respects reduced media query
- Modal animations respect reduced motion
- Skeleton animation respects reduced motion (can be disabled)
- No essential motion removed - alternatives provided

## Performance (React + React Query)

### API Endpoint

- **GET /projects** - Returns list of all projects with metadata
- **Response**: Array of project objects with: id, name, repoFullName, branch, health state, lastDeployedAt, etc.
- **Performance**: Should be fast (< 200ms) - reads from JSON file store
- **Pagination**: Not currently implemented - all projects returned at once (acceptable for small-mid-sized deployments)

### Table Rendering

- One `<tr>` per project, 6 `<td>` per row
- No virtual DOM - direct DOM manipulation via React
- Efficient enough for typical project counts (10-50 projects typical)
- Horizontal scroll wrapper adds no performance impact

### Bundle Impact

- React 18 + React DOM: ~100KB gzipped
- @tanstack/react-query: ~5KB gzipped
- Custom components: minimal
- React Hook Form + Zod (if used): ~15KB gzipped
- Total: ~120-150KB gzipped (acceptable increase over vanilla JS)

### Memory

- Project list array stored in `useQuery` cache
- No per-project event listeners on dashboard (they're on project detail page)
- Click handlers use React event system (not document.addEventListener)
- No leaked timers or event listeners

## Implementation Notes

### Existing Code Port

The projects list is ported from `app.js` `loadProjects()` function (lines 371-403). Key mappings:

**Already mapped:**
- API call to `/projects` ✅
- Rendering table with Name, Repo, Branch, Health, Last deploy columns ✅
- Empty state when no projects exist ✅
- "+ New project" button opens modal ✅
- Health pill coloring per project state ✅
- Row click navigation to project detail ✅
- Skeleton loading states ✅

**New (React + TS):**
- `useQuery` hook for data fetching
- `useMutation` for project creation
- TypeScript types for project data
- React component structure
- React Hook Form for form handling (optional)
- React Query for state management

**Enhancements from React version:**
- React Query handles data caching and refetching
- Form state management with React Hook Form (vs ad-hoc in app.js)
- Type safety across the component
- Better error handling and validation
- Easy retry on form submission
- Testability with @testing-library/react

### API Contract

The `/projects` API endpoint should return JSON with this shape:

```json
[
  {
    "id": "project-uuid",
    "name": "expense-api",
    "repoFullName": "github.com/username/expense-api",
    "branch": "main",
    "health": "healthy" | "attention" | "critical",
    "lastDeployedAt": "2026-09-20T14:30:00Z",
    "hostPort": 8080
  }
]
```

Key fields needed for the table: `name`, `repoFullName`, `branch`, `health.state`, `lastDeployedAt`.

### Component Integration

- **Project table**: Should use the established table HTML pattern with React rows
- **Health pills**: Should reference CSS variables or Pill component variants
- **Empty state**: Should use the React EmptyState component
- **New project button**: Could be unified - single CTA, perhaps as a floating action button or at top of page
- **Skeleton loading**: Could be improved with row-shaped skeletons

### Visual Refinements to Apply

1. **Table striping**: Add `tr:nth-child(even) { background: var(--surface-raised); }` for improved readability
2. **Repository name overflow**: Add `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` to repo cell
3. **Health pill consistency**: Ensure pills in project table use the same Pill component as elsewhere
4. **Empty state messaging**: Ensure "Connect a GitHub repo and a server to deploy your first app." is the message
5. **Button consistency**: "+ New project" button should match primary button style consistently
6. **Hover state**: Ensure `tr:hover` doesn't conflict with `.active` state or selected row

### Testing Checklist (React + TS)

- [ ] Projects list loads with sample data
- [ ] Empty state shown when no projects exist
- [ ] "+ New project" button opens modal
- [ ] Health pills color-code correctly (healthy=green, unhealthy=danger, unknown=neutral)
- [ ] Row click navigates to project detail
- [ ] Breadcrumb updates to "Projects / {project name}"
- [ ] Table hover background changes
- [ ] Repository names don't overflow (ellipsis or truncation)
- [ ] Horizontal scroll available on table-wrapper if needed
- [ ] Skeleton loading shown before API resolves
- [ ] Error message shown when API fails
- [ ] Focus-visible outlines on interactive elements
- [ ] Table grid responsive at mobile breakpoints
- [ ] "← All projects" returns to projects list
- [ ] Pill colors have sufficient contrast
- [ ] Repository hint text is readable but secondary
- [ ] New project modal prerequisite checks work (servers, GitHub connection)
- [ ] TypeScript types compile without errors
- [ ] Form validation works (required fields, etc.)

## Visual References

- Original implementation in `app.js` `loadProjects()` function (lines 371-403)
- Design tokens in `public/styles.css` `:root` variables
- IBM Plex Sans / IBM Plex Mono font stack
- Color palette from existing styles.css (dark theme default)
- GitHub repositories list inspiration - table-styled project overview
- Table row hover patterns from admin dashboards
- Empty state onboarding patterns (friendly, helpful, CTA-focused)
- React Hook Form patterns from form examples
- React Query data fetching patterns