# Dashboard (React + TypeScript)

## Purpose (Updated)

The dashboard is the primary entry point and main monitoring interface for Forge users. It provides an at-a-glance view of the overall system health, key metrics, and recent activity. It serves as the "quiet by default" hub — when everything is healthy, the user sees a simple reassuring state, and when action is needed, prominent visual cues guide them.

Built with **React + TypeScript + React Query**, replacing the vanilla JS `app.js` `loadDashboard()` function.

## User Goal

- Quickly understand the current health status of Forge and all connected components
- View high-level metrics (project count, server count, open incidents)
- See recent activity to stay informed of what's happening
- Navigate to deeper pages (projects, servers, audit, settings) from this central location
- Take immediate action when issues are detected

## Layout (React Components)

### Top Section: Health Hero

- **Component**: `<HealthHero data={dashboardData} />`
- **Purpose**: Displays overall system state as the first visual element
- **Props**:
  - `overall`: 'healthy' | 'attention' | 'critical'
  - `components`: { application, server, security, network, ssl, deployment: 'healthy' | 'attention' | 'critical' }
- **Content**:
  - Large status indicator with state-dependent coloring
  - Label: "Forge status"
  - Sub-label with natural language description
  - 6-component status pills (Application, Server, Security, Network, SSL, Deployment)
- **State-dependent styling**: 
  - `.state-healthy` → green accent (#7cae8a)
  - `.state-attention` → amber accent (#d6a55b)
  - `.state-critical` → red accent (#d5715a)

### Middle Section: Metric Tiles

- **Component**: `<MetricsGrid />` or individual `<MetricTile />` components
- **Purpose**: Display key count metrics at a glance
- **Content** (4 tiles, responsive grid):
  1. **Projects** - Count of registered projects
  2. **Servers** - Count of connected/provisioned servers
  3. **Open incidents** - Count of currently open/active incidents
  4. **Signed in as** - Current user's username
- **Tile styling**: Consistent with design system `.tile` component
- **Responsive**: 4 columns (desktop) → 3 (sm) → 2 (md) → 1 (xs, using CSS grid)

### Bottom Section: Recent Activity

- **Component**: `<ActivityList items={dashboardData.recentActivity} />`
- **Purpose**: Show recent events and user actions
- **Content**:
  - Intro text when no activity: "Nothing yet — actions you take will show up here."
  - List of recent activity entries, each showing:
    - Actor and action description
    - Time ago (e.g., "2h ago", "3d ago")
- **Empty state**: Prompt encouraging first actions

### Breadcrumbs

- **Location**: Topbar component, below the sidebar/project indicator
- **Content**: "Dashboard" (active view highlight)
- **Purpose**: Show current navigation context

## Data Fetching (React Query)

```typescript
import { useQuery } from '@tanstack/react-query';

function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard', {
        credentials: 'same-origin',
        headers: { 'X-Forge-Client': '1' },
      });
      if (!res.ok) throw new Error('Dashboard API failed');
      return res.json();
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // re-fetch every minute for health status
  });
}
```

## Components

### HealthHero

```typescript
interface HealthHeroProps {
  overall: 'healthy' | 'attention' | 'critical';
  components: {
    application: 'healthy' | 'attention' | 'critical';
    server: 'healthy' | 'attention' | 'critical';
    security: 'healthy' | 'attention' | 'critical';
    network: 'healthy' | 'attention' | 'critical';
    ssl: 'healthy' | 'attention' | 'critical';
    deployment: 'healthy' | 'attention' | 'critical';
  };
}

function HealthHero({ overall, components }: HealthHeroProps) {
  const stateClass = `state-${overall}`; // state-healthy / state-attention / state-critical
  
  return (
    <div 
      className="rounded border border-border bg-surface py-8 md:py-12 text-center"
      className={stateClass} // applies state-dependent styling
    >
      <p className="text-base text-text-secondary mb-2">Forge status</p>
      <p className="text-2xl font-bold tracking-tighter stateClass">
        {overall === 'healthy' ? 'All systems healthy' : overall === 'attention' ? 'Needs attention' : 'Critical issue'}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 max-w-md mx-auto">
        {Object.entries(components).map(([key, state]) => (
          <span 
            key={key} 
            className={`pill pill-${state === 'healthy' ? 'success' : state === 'attention' ? 'warning' : 'danger'} text-xs inline-flex items-center gap-1 px-2 py-1 rounded`}
          >
            {state}
          </span>
        ))}
      </div>
    </div>
  );
}
```

### MetricTile

```typescript
interface MetricTileProps {
  label: string;
  value: string | number;
  sub?: string;
}

function MetricTile({ label, value, sub }: MetricTileProps) => {
  return (
    <div 
      className="rounded border border-border bg-surface p-4 text-center"
    >
      <p className="text-sm text-text-secondary mb-1">{label}</p>
      <p className="text-2xl font-bold tracking-tighter">{typeof value === 'number' ? value : String(value)}</p>
      {sub && <p className="text-sm text-text-secondary mt-1">{sub}</p>}
    </div>
  );
};
```

### ActivityList

```typescript
interface ActivityEntry {
  actor: string;
  action: string;
  ts: string;
}

function ActivityList({ items }: { items: ActivityEntry[] }) => {
  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <p className="text-text-secondary text-sm">
          Nothing yet — actions you take will show up here.
        </p>
      )}
      {items.map((entry, index) => (
        <div 
          key={index} 
          className="flex items-baseline justify-between border-b border-border pb-4 last:border-0"
        >
          <span className="text-text-secondary text-sm">
            {entry.actor} — {entry.action.replace(/\./g, ' · ')}
          </span>
          <span className="text-text-muted text-xs">{timeAgo(entry.ts)}</span>
        </div>
      ))}
    </div>
  );
};
```

## Data Fetching Details

### API Endpoint

- **GET /dashboard** - Returns dashboard data shape (same as original PRD)
- **Response**: `DashboardData` interface (see Type definitions above)
- **Performance**: Should be fast (< 300ms) since it queries JSON file data
- **React Query**: `staleTime: 30000` (30s), `refetchInterval: 60000` (1 min for health polling)

### Polling for Health Status

- React Query's `refetchInterval` handles periodic health checks
- When `overall` state changes, UI updates automatically
- No manual setTimeout poller needed (React Query handles this)
- On initial mount, data fetches immediately

### Error State

- If `/dashboard` API fails: useQuery's `isError` state true
- Error boundary or error component shows readable error message
- User can retry by navigating away and back, or refreshing

## Loading State

### Initial Load

- **Health hero**: Shows skeleton loading component until data resolves
- **Metric tiles**: Show skeleton placeholders (3-4 skeleton lines with varying widths)
- **Activity**: Empty state text shown
- **React Query default**: Shows `isLoading` state with custom skeleton component

### Skeleton Component (React)

```typescript
function SkeletonLine({ width = '100%', height = '12px' }: { width?: string; height?: string }) {
  return (
    <div 
      className="rounded bg-surface-raised animate-shimmer h-4 w-full"
      style={{ width, height }}
    />
  );
}

function animateShimmer() {
  // CSS keyframes already in global styles
}
```

### During API Response

- React Query replaces skeleton with real data instantly
- No spinners or pulsating animations - just the skeleton shimmer fading out
- Duration: depends on API response time (typically < 500ms)

### Reduced Motion

- All skeleton animations respect `prefers-reduced-motion`
- If user prefers reduced motion: skeletons appear instantly (no animation)
- Color state changes use transition or immediate change based on preference

## Empty State

### When No Data / Error

- **Message**: Error text displayed in health hero location
- **Content**: `<p>{error.message}</p>` or generic error
- **Styling**: Default text color, no state class applied
- **User action**: User can navigate away and back to retry

### Visual Treatment

We need to original design

- Error message is readable but not alarming (no red color unless the error itself is about health)
- Background remains var(--surface), border remains var(--border)
- No state class `.state-critical` added just because of error

## Error State

### API Failure

- **Location**: Health hero component
- **Content**: Error message from React Query error state
- **Visual**: Same as original - background var(--surface), border var(--border), no state class
- **Dismissal**: User can navigate away and back to retry

### Success State

### Healthy System

- **Health hero**: `.state-healthy` class, green accent color (#7cae8a)
- **Status text**: "All systems healthy"
- **Component pills**: All show "healthy" state (green pills)
- **Tiles**: All metrics show positive numbers
- **Activity**: May show recent successful deployments or health checks

### System Recovery

- If system recovers from attention/critical to healthy:
- Health hero state class changes from `.state-attention` → `.state-healthy`
- Status text changes from "Needs attention" → "All systems healthy"
- Component pills update from warning/danger to success (green)
- May trigger a toast: "All systems healthy" or similar subtle confirmation

## Accessibility (React + ARIA)

### Keyboard Navigation

- Tab reaches all interactive elements (sidebar nav items, topbar buttons)
- Escape key closes open command palette or modal
- Arrow keys navigate command palette selections
- Enter activates selected palette item

### Focus States

- `*:focus-visible`: 2px solid var(--accent-strong), outline-offset 2px
- Consistent focus behavior across all interactive elements
- Focus rings visible and sufficient contrast

### Semantic HTML

- Buttons use `<button>` elements for actions
- Links use `<a>` for navigation where appropriate
- Headings hierarchical (h1-h3 used for page structure)
- Proper heading hierarchy

### Contrast

- Health status text contrasts against var(--bg) (#14171b) - WCAG AA compliance
- Component pills have sufficient contrast against var(--surface)
- Breadcrumb text against var(--surface) is readable

### Screen-Reader Structure

- Page has logical heading hierarchy
- Landmarks: header (topbar), navigation (sidebar), main content (main > .content)
- Lists use proper `<table>` elements for tabular data (if needed)
- Live region: `#toast-region` for toast notifications

### Reduced Motion

- Skeleton shimmer respects `prefers-reduced-motion`
- Color transitions may be instantaneous based on media query
- No essential motion removed - alternatives provided

## Performance (React + React Query)

### API Endpoint

- **GET /dashboard** - Returns overall system health, component states, counts
- **Response time**: Should be fast (< 300ms) since it queries JSON file data
- **React Query cache**: 30s stale time, 1min refetch interval
- **No heavy computation**: Reads from `data/db.json` or similar simple data store

### Bundle Impact

- React 18 + React DOM: ~100KB gzipped
- @tanstack/react-query: ~5KB gzipped
- Custom components: minimal (mostly CSS-class-based)
- No virtual DOM overhead for simple layouts
- Total additional: ~150KB gzipped (acceptable)

### Rendering Performance

- React Reconciliation updates only what changed
- Skeleton elements are simple divs - cheap to mount/remove
- Grid layout is CSS-driven, not JS-driven
- No reflow issues

### Memory

- Dashboard data stored in React Query cache
- No per-component event listeners added
- Pollers handled by React Query `refetchInterval` - cleaned up on unmount
- State management is minimal (just the data returned from API)

## Implementation Notes

### Existing Code Port

The dashboard is ported from the original `app.js` `loadDashboard()` function (lines 318-361). Key mappings:

**Already mapped:**
- API call to `/dashboard` ✅
- Health hero state coloring based on `data.overall` ✅
- Component pills with color coding ✅
- Tile metrics (Projects, Servers, Open incidents, Signed in as) ✅
- Recent activity rendering ✅
- Skeleton loading states ✅

**New (React Query + TS):**
- `useQuery` hook for data fetching
- `refetchInterval` for health polling (replaces manual setTimeout)
- TypeScript types for all data shapes
- React component structure (JSX vs innerHTML)
- Component-based architecture (HealthHero, MetricTile, ActivityList vs one big function)
- Error handling via React Query `isError` state

**Enhancements from React version:**
- Automatic polling via React Query (no manual setTimeout)
- Built-in error states and retry logic
- Loading skeletons managed by framework
- Type safety across the component
- Easy cache invalidation and refetching
- Better testability with @testing-library/react

### Type Definitions (New)

```typescript
// types/dashboard.d.ts
export interface DashboardData {
  overall: 'healthy' | 'attention' | 'critical';
  components: {
    application: 'healthy' | 'attention' | 'critical';
    server: 'healthy' | 'attention' | 'critical';
    security: 'healthy' | 'attention' | 'critical';
    network: 'healthy' | 'attention' | 'critical';
    ssl: 'healthy' | 'attention' | 'critical';
    deployment: 'healthy' | 'attention' | 'critical';
  };
  projectCount: number;
  serverCount: number;
  openIncidents: number;
  recentActivity: {
    actor: string;
    action: string;
    ts: string;
  }[];
}

export interface MetricTileProps {
  label: string;
  value: string | number;
  sub?: string;
}

export interface HealthHeroProps {
  overall: 'healthy' | 'attention' | 'critical';
  components: DashboardData['components'];
}
```

### Component Integration

- **HealthHero**: Should use the established design system component with CSS variable state classes
- **MetricTiles**: Should use the `.tile` component pattern from design system (or the React MetricTile component)
- **ActivityList**: Should use the established inline-row + border-bottom pattern, now as React components
- **Skeleton loading**: Use React Query's built-in loading state or custom skeleton components

### Visual Refinements (React vs Original)

1. **State class application**: Instead of `hero.className = \`health-hero state-${data.overall}\`` (original), use `className={stateClass}` in JSX (React)
2. **Tile rendering**: Instead of `tiles.innerHTML = ''; tileData.forEach(...)`, use `tiles.map(tileData => <MetricTile key={...} {...} />)` (React)
3. **Activity rendering**: Instead of `activity.innerHTML = ''; data.recentActivity.forEach(...)`, use `items.map(entry => <ActivityListItem key={...} {...} />)` (React)
4. **Event handling**: Original used `document.addEventListener('click', ...)`; React uses onClick handlers or delegated events
5. **State management**: Original used global `state` object; React uses React Query cache + local component state

### Testing Checklist (React + TS)

- [ ] Dashboard loads with healthy system data
- [ ] Dashboard shows attention state when components have warnings
- [ ] Dashboard shows critical state when components are down
- [ ] Tiles grid responds: 4 → 3 → 2 → 1 columns at breakpoints
- [ ] Sidebar collapses on mobile (max-width 860px)
- [ ] Skeleton loading shown before API resolves
- [ ] Error message shown when API fails
- [ ] Focus-visible outlines appear on interactive elements
- [ ] Reduced motion preference skeletons are instant (no animation)
- [ ] Breadcrumb shows "Dashboard" as active
- [ ] Toast can appear if actions trigger notifications
- [ ] All color values are CSS variables from the design system
- [ ] TypeScript types compile without errors
- [ ] React Query cache works correctly (staleTime, refetchInterval)
- [ ] Hover states work on all interactive elements
- [ ] Focus order is logical: header → main content → sidebar

## Visual References

- Original implementation in `app.js` `loadDashboard()` function (lines 318-361)
- Design tokens in `public/styles.css` `:root` variables
- IBM Plex Sans / IBM Plex Mono font stack
- Color palette from existing styles.css (dark theme default)
- GitHub dashboard-inspired health monitoring layout
- React Query dashboard patterns from admin templates
- TanStack Table patterns (if using for data grid)
- Skeleton loading patterns from React Table or custom