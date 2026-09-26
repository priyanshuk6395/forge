# frontend-design.md - React + TypeScript Version

## Brand Direction (Updated for React)

- **Product personality**: GitHub + Vercel-like deployment simplicity + EC2 control + an opinionated DevOps engineer. The complexity is hidden, not removed.
- **Visual identity**: Premium, clean, functional. Dark theme as default with light mode support. Maintains the existing color palette from `public/styles.css` while adapting to React component library conventions.
- **Design philosophy**: "Quiet by default" - the UI should stay out of the user's way when things are healthy, and become prominent only when action is needed.
- **Desired emotional response**: Confidence, control, simplicity. The developer should feel capable of managing their infrastructure without feeling overwhelmed.
- **Target user experience**: Independent developers and small engineering teams who use GitHub, deploy to VMs, prefer simple UI over repetitive CLI workflows.
- **Visual references**: GitHub interface, Vercel/dashboard-style admin panels, pragmatic SaaS admin UIs.
- **Things the UI should avoid**: Unnecessary decorative effects, visual noise, hiding important information behind trendy design, animations that don't serve a purpose.

## Visual System (React + TypeScript)

### Color Palette (from existing styles.css, mapped to CSS variables)

**Dark theme (default):**
- `--bg`: #14171b - Primary background
- `--surface`: #1b1f24 - Secondary surfaces
- `--surface-raised`: #21262c - Elevated surfaces/buttons
- `--border`: #2a3037 - Default borders
- `--border-strong`: #3a4149 - Strong borders/active states
- `--text`: #e8e6e1 - Primary text
- `--text-secondary`: #9ca1a8 - Secondary text
- `--text-muted`: #666c73 - Muted text
- `--accent`: #5a92b3 - Primary accent (primary actions, links)
- `--accent-strong`: #7bacc9 - Strong accent (hover states)
- `--success`: #7cae8a - Success state
- `--warning`: #d6a55b - Warning state
- `--danger`: #d5715a - Danger state
- `--glass-bg`: rgba(27, 31, 36, 0.72) - Modal/panel backgrounds with backdrop filter

**Light theme:** (same values as original styles.css)

### Typography (React/TS version)

- **Font family**: `IBM Plex Sans` (UI), `IBM Plex Mono` (monospace/code)
- **Base size**: 14px, line-height: 1.5 (in REM: `1rem = 14px`)
- **Hierarchy** (in REM):
  - Page titles: 1.75-2rem (28-32px), font-weight 700, letter-spacing -0.01em
  - Section titles: 1.25-1.5rem (20-24px), font-weight 600
  - Body: 1rem (14px), regular
  - Supporting text: 0.85-0.95rem (12-13px), color var(--text-secondary)
  - Labels: 0.85rem (12.5px), font-weight 500
  - Small print/hints: 0.75-0.85rem (11-12px), color var(--text-muted)

### Radius System

- `--radius`: 10px - Standard radius for most elements (CSS variable)
- React component: `radius={10}` or `className="radius-10"` (if using classNames)
- Modal borders: 12px
- Pills/buttons: 8px
- Tiny elements: 4px

### Spacing System (REM-based)

- Consistent 4px base unit (0.25rem)
- Standard gaps: 0.25rem (4px), 0.5rem (8px), 0.75rem (12px), 1rem (16px), 1.25rem (20px), 1.5rem (24px)
- Panel padding: 1rem (16px) - *note: original has 18px (=1.125rem), keep as 1rem for React consistency OR use CSS variable*
- Content padding: 1.5rem (24px) (desktop), 1rem (16px) (mobile)
- Tile/metric spacing: 0.75rem (12px) grid gap

### Grid / Container (CSS Grid + React)

- Maximum container width for content: ~1440px
- Tiles grid: 4 columns (desktop) → 3 → 2 (responsive, using CSS grid)
- Health components grid: 4 columns → 2 (responsive, container queries or media queries)
- Sidebar: 220px fixed (collapsible on mobile) = 13.75rem

## Component System (React + TypeScript)

### Button Component (`Button.tsx`)

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  asLink?: boolean; // renders as <a> if true
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  asLink = false,
  children,
  className,
  ...props
}) => {
  const baseClasses = 'btn font-medium rounded transition-colors';
  const variantClasses = {
    primary: 'bg-accent text-[0d1216] hover:bg-accent-strong',
    ghost: 'bg-transparent border border-border hover:bg-surface-raised',
    danger: 'border border-danger text-danger hover:bg-danger hover:text-[1b1f24]',
    subtle: 'bg-surface-raised text-text hover:bg-border',
  };
  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return asLink 
    ? <a href={props.href} className={baseClasses} style={{ ...props.style }} {...props}>
        {children}
      : <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`} className={clsx(baseClasses, className)} {...props}>
        {children}
      </button>;
};
```

### Input Component (`Input.tsx`)

```tsx
interface InputProps extends React.TextInputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'textarea';
  placeholder?: string;
}

const Input: React.FC<InputProps> = ({ variant = 'default', placeholder, ...props }) => {
  return (
    <input
      className="w-full font-serif rounded border border-border bg-surface-raised text-text placeholder:text-muted placeholder:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent-strong focus:border-accent"
      type={variant === 'textarea' ? 'textarea' : 'text'}
      placeholder={placeholder}
      {...props}
    />
  );
};
```

### Form Component (`Form.tsx`)

Uses React Hook Form + Zod for validation (evaluated per design system Section 7).

### Card/Panel Component (`Card.tsx`)

```tsx
interface CardProps {
  className?: string;
  children: React.ReactNode;
  padding?: 'sm' | 'md' | 'lg'; // maps to padding classes
}

const Card: React.FC<CardProps> = ({ className, padding, children }) => {
  const paddingClasses = {
    sm: 'py-3 px-4',
    md: 'py-4 px-6',   // original: 18px
    lg: 'py-6 px-8',
  };
  return (
    <div className={`rounded border border-border bg-surface ${paddingClasses[padding] || paddingClasses.md} ${className}`}>
      {children}
    </div>
  );
};
```

### Tile Component (`Tile.tsx`)

```tsx
interface TileProps {
  value: string | number;
  label: string;
  sub?: string;
}

const Tile: React.FC<TileProps> = ({ value, label, sub }) => {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="text-sm text-text-muted mb-1.5">{label}</p>
      <p className="text-1.75 font-bold tracking-tighter">{typeof value === 'number' ? value : Number(value)}</p>
      {sub && <p className="text-sm text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
};
```

### Table Component (`Table.tsx`)

Uses React Table (@tanstack/react-table) or simple table component.

### Empty State (`EmptyState.tsx`)

```tsx
const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description: string;
  cta?: { label: string; onClick: () => void };
}> = ({ icon, title, description, cta }) => {
  return (
    <div className="text-center py-12 text-text-secondary">
      {icon && <div className="w-12 h-12 mx-auto mb-4 opacity-50">{icon}</div>}
      <h3 className="text-text mb-1.5">{title}</h3>
      <p>{description}</p>
      {cta && <button className="mt-4 px-4 py-1 text-primary">{cta.label}</button>}
    </div>
  );
};
```

### Modal Component (`Modal.tsx`)

Uses Radix UI Dialog or custom implementation with Focus Trap.

### Chip Component (`Chip.tsx`)

```tsx
const Chip: React.FC<{
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
}> = ({ label, variant = 'neutral', size = 'md' }) => {
  const variantClasses = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    neutral: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full text-xs px-2.5 py-0.5 ${variantClasses[variant]}`}>
      {label}
    </span>
  );
};
```

## Motion System (React + Framer Motion / CSS)

### Hover Behavior

- Button onHover: background color change via CSS variables or Framer Motion
- Input: border-color change on focus
- Tables: row background change on hover

### Click Feedback

- Button: disabled state during API calls with visual feedback
- Form submit: button text "Creating..." during loading

### Reduced Motion

- `prefers-reduced-motion: reduce` respected via `motionReduced` prop in Framer Motion or CSS media queries
- All animations optional

### Micro-interactions

- Focus-visible: 2px solid var(--accent-strong), outline-offset 2px
- Form input focus: border-color var(--accent)
- Button hover: border-color change

## Responsive System (React + CSS/Mobile-First)

### Breakpoints (Tailwind-style or CSS variables)

- **XS**: <640px (390px mobile)
- **SM**: ≥640px (430px mobile)
- **MD**: ≥768px (tablet)
- **LG**: ≥1024px (laptop)
- **XL**: ≥1280px (desktop)
- **2XL**: ≥1440px (large desktop)

### Sidebar Collapse

- **max-width 860px**: Sidebar hidden, toggle button shown
- **Sidebar open**: state management (mobileNavOpen)
- **Hide**: breadcrumb label, navigation labels on mobile

### Responsive Grid

- `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`
- Container queries possible with `@container` queries

## Accessibility (React + ARIA)

### Keyboard Navigation

- Tab order follows visual DOM order
- All interactive elements (buttons, inputs, selects) reachable via Tab
- Escape key closes modals and command palette
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
- `<form>` elements for submit actions
- `<input>`, `<select>`, `<textarea>` for form controls

### ARIA

- Modals: `role: 'dialog'`, `aria-modal: 'true'`
- Overlay: `role: 'presentation'`
- Focus management: first focusable element in modal receives focus on open

### Contrast

- Existing color palette meets WCAG AA for normal text against backgrounds
- Sufficient contrast between text and var(--bg), var(--surface)
- Accent color var(--accent) has 3:1 minimum against backgrounds

### Screen-Reader Structure

- Page has logical heading hierarchy
- Landmarks: header (topbar), navigation (sidebar), main content (main > .content)
- Lists use proper `<table>` elements for tabular data
- Live region: `#toast-region` for toast notifications

### Accessible Forms

- Labels explicitly associated with inputs
- Form controls have clear focus indicators
- Error messages provided inline

### Reduced Motion

- Media query `prefers-reduced-motion: reduce` implemented
- All animations and transitions respect the preference

## Performance (React + TypeScript)

### Dependency Policy

- **Currently**: No frontend framework dependencies - vanilla JS + CSS (existing strength)
- **After migration**: Add carefully chosen libraries that justify bundle impact
- **Performance budget**: Initial load < 2s on 3G, interaction < 100ms

### Bundle Size

- React 18 + React DOM: ~100KB gzipped
- @tanstack/react-query: ~5KB gzipped
- Framer Motion: ~25KB gzipped
- Radix UI: ~15KB gzipped
- React Hook Form + Zod: ~15KB gzipped
- **Total**: ~150-200KB gzipped for core functionality (acceptable)

### Code Splitting

- `dynamic import()` for non-critical pages
- Route-based code splitting with React Router
- Lazy loading of modals and complex components

### Rendering Strategy

- React Reconciliation (Virtual DOM)
- Efficient re-renders with useMemo, useCallback
- No unnecessary re-renders
- Component memoization where needed

### Animation Performance

- CSS animation properties where possible (transform, opacity)
- Framer Motion uses optimized animations
- Avoid layout-thrashing animations
- 120ms transition duration is reasonable

## Design System Establishment (React Port)

### Existing Foundations (from styles.css)

The project already has a strong foundation that maps well to React:

1. **Design tokens** in `:root` with dark/light themes → CSS custom properties
2. **Color system** with 12+ semantic colors → CSS variables
3. **Typography** with font stack and hierarchy → REM-based scale
4. **Spacing** with consistent padding/margins → REM scale
5. **Components**: buttons, inputs, cards, tables, modals, skeletons, toasts → React components
6. **Responsive** breakpoints already coded → CSS grid/ Tailwind breakpoints
7. **Accessibility**: `:focus-visible`, reduced motion media query → ARIA + focus-visible
8. **Color scheme**: `color-scheme: dark` / `light` → meta tag + CSS variables

### What Needs Enhancement (React-specific)

1. **Component organization**: Currently scattered in styles.css; should be modular React components
2. **TypeScript**: Add for type safety across the application
3. **Component library**: Use Radix UI primitives + shadcn/ui patterns for consistent design
4. **Documentation**: Design system needs to be written down in TS-aware format (this document)
5. **Test coverage**: Visual regression, accessibility tests with @testing-library/react

### Library Evaluation (React + Forge Context)

**Radix UI**: ✅ **RECOMMENDED** - Provides accessible primitives (Dialog, Tabs, Dropdown, Tooltip) with ~15kB. Excellent for modals, tabs, command palette. Maps directly to existing functionality.

**shadcn/ui**: ✅ **RECOMMENDED** (with Tailwind) - Beautiful components but requires Tailwind CSS. Would need to adapt the existing CSS variable-based design to Tailwind config. Good starting point.

**React Hook Form + Zod**: ✅ **RECOMMENDED** - Form management with schema validation. Adds ~15KB total. Replaces ad-hoc form handling in app.js.

**Zod**: ✅ **RECOMMENDED** - Schema validation (~3KB). Current ad-hoc validation works but Zod provides type-safe schemas that match the React type layer.

**Framer Motion**: ✅ **OPTIONAL** - Animation library. Current CSS animations are sufficient, but Framer Motion adds nice micro-interactions (~25KB). Could replace skeleton shimmer with motion animations.

**TanStack Query**: ✅ **RECOMMENDED** for data fetching → replaces the manual `api()` fetch + polling pattern. Provides caching, refetching, stale-while-revalidate.

**Headless UI**: ✅ **ACCEPTABLE** - Similar to Radix UI but from Tailwind Labs. Slightly more opinionated.

**Mantine**: ❌ **NOT RECOMMENDED** - Full UI kit, heavy dependency (heavy bundle impact). Not justified for this use case.

**React Three Fiber / Three.js**: ❌ **NOT APPROPRIATE** - 3D. Not appropriate for infrastructure control panel.

**GSAP**: ⚠️ **SPARINGLY** - Animation engine. Current CSS animations adequate; adding would increase bundle.

**Lucide / React Icons**: ✅ **RECOMMENDED** - Icon set. Currently using simple CSS gradients for the mark. Lucide provides lightweight SVGs (~3KB).

**Embla**: ❌ **NOT NEEDED** - Carousel/slider. Not needed for this UI.

### Migration Strategy

1. **Phase 1**: Set up React + TypeScript project alongside existing
2. **Phase 2**: Port core components (Button, Input, Card, Table, EmptyState, Modal)
3. **Phase 3**: Migrate state management (React Query + TypeScript types)
4. **Phase 4**: Migrate each page (Dashboard, Projects, Project Detail, etc.)
5. **Phase 5**: Remove old app.js, optimize bundle

### Decisions Record (New Section)

Pending creation in `decisions/` directory - see guidance in main prompt.

---

## Page Specifications (React + TypeScript Versions)

Following are the React + TypeScript adapted versions of the page specifications. Each preserves the existing Forge visual language while using React patterns.

### 1. Dashboard (React + TS)

**Key Changes from Vanilla JS:**

- State management via React useState + React Query (for `/dashboard` API)
- Components: `Dashboard`, `HealthHero`, `MetricTile`, `ActivityEntry`, `Sidebar`, `Topbar`
- Data fetching: `useQuery('/dashboard')` with React Query
- Polling: React Query's `refetchInterval` for health status updates
- Form: No forms on dashboard (read-only), but skeleton loading replaces the skeleton-line divs
- TypeScript types for dashboard API response

**Type Definition:**

```typescript
interface DashboardData {
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
```

**React Component Structure:**

```tsx
// Dashboard.tsx
export function Dashboard() {
  const { data, isLoading, isError } = useQuery('/dashboard');
  
  if (isLoading) return <SkeletonDashboard />;
  if (isError) return <ErrorState error={data?.error} />;
  
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Topbar />
        <section className="content">
          <HealthHero data={data?.overall} components={data?.components} />
          <MetricsGrid projects={data?.projectCount} servers={data?.serverCount} incidents={data?.openIncidents} />
          <ActivityList items={data?.recentActivity} />
        </section>
      </main>
    </div>
  );
}
```

### 2. Projects (React + TS)

**Key Changes from Vanilla JS:**

- `useQuery('/projects')` for data fetching
- `useMutation` for project creation
- Table component with sorting/filtering (enhanced from original)
- Component structure: `Projects`, `ProjectTable`, `ProjectRow`, `EmptyState`, `NewProjectModal`
- Health pills as `Pill` component variants

**Type Definition:**

```typescript
interface Project {
  id: string;
  name: string;
  repoFullName: string;
  branch: string;
  health: 'healthy' | 'attention' | 'critical';
  lastDeployedAt: string | null;
}
```

**React Component:**

```tsx
// Projects.tsx
export function Projects() {
  const { data, isLoading, isError } = useQuery('/projects');
  const [createModal] = useNewProjectModal(); // custom hook
  
  if (isLoading) return <SkeletonProjects />;
  if (isError) return <ErrorState />;
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Projects</h2>
      <NewProjectModal />
      {data?.length ? (
        <ProjectTable projects={data} />
      ) : (
        <EmptyState
          title="No projects yet"
          description="Connect a GitHub repo and a server to deploy your first app."
          cta={{ label: "+ New project", onClick: () => openModal() }}
        />
      )}
    </div>
  );
}
```

### 3. Project Detail (React + TS)

**Key Changes from Vanilla JS:**

- Tabs: React Tab View or simple state management
- `useQuery('/projects/{id}')` for project data
- `useQuery('/projects/{id}/logs')` for logs
- `useMutation` for deploy, rollback, settings save, delete
- Polling via React Query for deployment building status
- Form components for settings, secrets

**Type Definition (simplified):**

```typescript
interface ProjectDetailData {
  project: {
    id: string;
    name: string;
    repoFullName: string;
    branch: string;
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
  trigger: string;
  startedAt: string;
  error?: string;
}
```

**React Component Structure:**

```tsx
// ProjectDetail.tsx
export function ProjectDetail({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery(`/projects/${projectId}`);
  const { mutate: deployMutation } = useDeployMutation();
  const { mutate: rollbackMutation } = useRollbackMutation();
  
  if (isLoading) return <SkeletonProjectDetail />;
  
  return (
    <ProjectLayout project={data?.project}>
      <Tabs defaultValue="releases">
        <Tab listId="project-tabs" value="releases">
          <TabPanel value="releases">
            <ReleasesTab deployments={data?.project?.deployments} onRollback={rollbackMutation} />
          </TabPanel>
        </Tab>
        <Tab value="logs">
          <TabPanel value="logs">
            <LogsPane refresh={/* refetch */} />
          </TabPanel>
        </Tab>
        <Tab value="secrets">
          <TabPanel value="secrets">
            <SecretsManagement secrets={data?.project?.secrets.keys} onAdd={/* add */} onRemove={/* remove */} />
          </TabPanel>
        </Tab>
        <Tab value="settings">
          <TabPanel value="settings">
            <ProjectSettings onSave={/* update */} project={data?.project} />
          </TabPanel>
        </Tab>
      </Tabs>
    </ProjectLayout>
  );
}
```

### 4. Servers (React + TS)

**Key Changes from Vanilla JS:**

- `useQuery('/servers')` for data
- `useMutation` for connect, provision, test, delete
- Modal components for "Connect existing" and "Provision on AWS"
- Status pills color-coded

**Type Definition:**

```typescript
interface Server {
  id: string;
  name: string;
  host: string;
  provider: 'ec2' | 'existing';
  status: 'ready' | 'connecting' | 'provisioning' | 'bootstrap_failed';
  hasKey: boolean;
}
```

### 5. Settings (React + TS)

**Key Changes from Vanilla JS:**

- `useQuery('/settings')` for initial state
- `useMutation` for GitHub connect/disconnect and AWS save
- Form components with React Hook Form + Zod validation
- Two sections: GitHub and AWS

**Type Definition:**

```typescript
interface SettingsState {
  github: {
    connected: boolean;
    login: string | null;
  };
  aws: {
    usingInstanceProfile: boolean;
    configured: boolean;
    region: string;
  };
}
```

### 6. Audit (React + TS)

**Key Changes from Vanilla JS:**

- `useQuery('/audit')` for data
- Table component with improved accessibility
- Enhanced error handling (original showed misleading "No activity recorded yet.")

---

## Implementation Priority (React Migration)

1. **Set up React + TypeScript project** alongside existing (or replace entirely)
2. **Establish design system in React** (this updated document)
3. **Create core component library** (Button, Input, Card, Table, EmptyState, Modal, Pill)
4. **Set up React Query** for data fetching (replaces manual api() calls)
5. **Migrate state types** to TypeScript (project states, server states, etc.)
6. **Port each page** following the React specs above
7. **Remove old app.js** and `public/app.js` after successful migration
8. **Optimize bundle size** and performance
9. **Add tests** with @testing-library/react

---

## Library Choices (React-Forceen)

Per the library evaluation (Section 7, updated for React):

| Library | Purpose | Decision | Size |
|---------|---------|----------|------|
| **@tanstack/react-query** | Data fetching, caching, polling | ✅ RECOMMENDED | ~5KB |
| **Radix UI** | Accessible primitives (Dialog, Tabs, Dropdown) | ✅ RECOMMENDED | ~15KB |
| **React Hook Form + Zod** | Form management + validation | ✅ RECOMMENDED | ~15KB |
| **Lucide React** | Icon set (replaces CSS gradient mark) | ✅ RECOMMENDED | ~3KB |
| **Framer Motion** | Micro-interactions/animations | ✅ OPTIONAL | ~25KB |
| **Tailwind CSS** (optional) | Utility-first styling | ⚠️ CONSIDER | ~30KB |
| **React Hook Form** | Form state management | ✅ RECOMMENDED | ~5KB |
| **Zod** | Schema validation | ✅ RECOMMENDED | ~3KB |
| **React Icons** | Alternative to Lucide | ⚠️ LARGER | ~15KB |

**Decision**: Use Radix UI + React Hook Form + Zod + Lucide + React Query. This combination provides:
- Accessible primitives for modals, tabs, dropdowns
- Form handling with schema validation
- Lightweight icon set
- Caching and stale-while-revalidate for data fetching
- Minimal bundle impact (~50KB additional)

**Not adding**: Mantine, shadcn/ui (without Tailwind), GSAP, Three.js, React Three Fiber.

---

## Current State Assessment (React + TS)

The existing Forge frontend, when migrated to React + TypeScript, retains:

✅ Strong design foundation (color palette, typography, spacing from styles.css)
✅ Dark theme as default with light mode support
✅ IBM Plex font stack (UI + mono)
✅ Consistent color palette across all states
✅ Functional component system (buttons, inputs, cards, tables, modals)
✅ Responsive breakpoints (will use CSS grid/Tailwind mobile-first)
✅ Accessibility foundations (focus-visible, reduced motion)
✅ Toast feedback system
✅ Modal system
✅ Command palette with keyboard navigation
✅ Skeleton loading states (can use React Query skeleton or Framer Motion)
✅ Empty states with guidance
✅ Sidebar navigation with active states
✅ Tabbed interfaces
✅ Health status visualization

⚠️ Areas for improvement (React-specific):
- Component organization: scatterd in styles.css → modular React components
- Type safety: add TypeScript types for all state, API responses
- Data fetching: replace manual fetch with React Query
- Form handling: replace ad-hoc with React Hook Form + Zod
- State management: centralize with React Query + Context if needed
- Build step: add bundler (Vite or CRA or Next.js)
- TypeScript types: define for all API responses

**Migration Goal**: Enhance, not replace. The visual language is sound; the implementation should be organized into React components, typed with TypeScript, and systematically improved while preserving the existing Forge look-and-feel.

---

## Visual References (React)

- React component patterns from existing `app.js` ported to TSX
- Design tokens mapped to CSS custom properties
- IBM Plex Sans / IBM Plex Mono font stack
- Color palette from existing styles.css (dark theme default)
- React dashboard patterns from admin templates
- Table component patterns from TanStack Table or simple HTML tables
- Modal patterns from Radix UI
- Empty state patterns from design systems
- Form patterns from React Hook Form examples
- Toast notifications from React Toastify or custom
- Skeleton loading from React Table or custom

---

## Next Steps

1. **Set up React project** with TypeScript (`npx create-react-app . --template typescript` or Vite)
2. **Install dependencies**: `@tanstack/react-query`, `radix-react`, `react-hook-form`, `zod`, `lucide-react`
3. **Create design system** components (Button, Input, Card, etc.)
4. **Port Dashboard first** as the entry point
5. **Migrate pages incrementally**
6. **Remove old app.js** and static `public/app.js`
7. **Test and iterate**

---

*This document is the React + TypeScript adaptation of the original frontend-design.md, maintained as the single source of truth for the frontend's visual and interaction system. Update in tandem with page specifications and whenever the design system changes.*